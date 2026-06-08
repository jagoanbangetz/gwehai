/**
 * Cost Service
 * 
 * Handles cost calculation, points normalization, and billing logic.
 * Extracted from ChatService for single-responsibility.
 */

import { Injectable, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import { BillingConfigService } from '../billing/billing-config.service';
import { CostCalculatorService } from '../billing/cost-calculator.service';
import { POINTS_ENABLED } from '../config/plan-billing.config';

@Injectable()
export class CostService {
  constructor(
    private pointsService: PointsService,
    @Optional() private billingConfig?: BillingConfigService,
    @Optional() private costCalculator?: CostCalculatorService,
  ) {}

  /**
   * Check if dynamic billing (reserve/settle) is available.
   */
  async isDynamicBillingAvailable(): Promise<boolean> {
    if (!POINTS_ENABLED || !this.billingConfig || !this.costCalculator) return false;
    try {
      await this.billingConfig.getSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get fixed cost points from model metadata.
   */
  getFixedCostPoints(model: Model): number | null {
    const raw = (model as any)?.metadata?.fixedCostPoints;
    if (raw === undefined || raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  /**
   * Normalize points to 2 decimal places.
   */
  normalizePoints(amount: number): number {
    return Number(Number(amount || 0).toFixed(2));
  }

  /**
   * Calculate cost points for a message.
   */
  calculateCostPoints(model: Model, inputTokens: number, outputTokens: number): number {
    const fixedCostPoints = this.getFixedCostPoints(model);
    const costPoints =
      fixedCostPoints !== null
        ? fixedCostPoints
        : (Number(model.pointsPer1kInputTokens) * inputTokens) / 1000 +
          (Number(model.pointsPer1kOutputTokens) * outputTokens) / 1000;
    return fixedCostPoints !== null
      ? this.normalizePoints(costPoints)
      : Math.max(1, Math.ceil(costPoints));
  }

  /**
   * Spend points for a chat turn (legacy billing).
   */
  async spendPointsForChat(
    userId: string,
    model: Model,
    conversationId: string,
    inputTokens: number,
    outputTokens: number = 500,
  ): Promise<number> {
    const finalCostPoints = this.calculateCostPoints(model, inputTokens, outputTokens);
    await this.pointsService.spendPoints(
      userId,
      finalCostPoints,
      PointLedgerReason.CHAT_USAGE,
      'usage_events',
      null,
      { modelId: model.id, conversationId },
    );
    return finalCostPoints;
  }

  /**
   * Save usage event to database.
   */
  async saveUsageEvent(
    manager: EntityManager,
    userId: string,
    modelId: string,
    messageId: string,
    inputTokens: number,
    outputTokens: number,
    costPoints: number,
  ): Promise<void> {
    const u = manager.create(UsageEvent, {
      userId,
      modelId,
      messageId,
      inputTokens,
      outputTokens,
      costPoints,
    });
    await manager.save(u);
  }

  /**
   * Reserve credits for dynamic billing.
   */
  async reserveCredits(userId: string, credits: number, messageId: string): Promise<void> {
    await this.pointsService.reserveCredits(userId, credits, messageId);
  }

  /**
   * Settle credits after dynamic billing.
   */
  async settleCredits(userId: string, messageId: string, reserved: number, actual: number): Promise<void> {
    await this.pointsService.settleCredits(userId, messageId, reserved, actual);
  }

  /** Expose billing config for legacy dynamic billing flow */
  get billingConfigService() {
    return this.billingConfig;
  }

  /** Expose cost calculator for legacy dynamic billing flow */
  get costCalculatorService() {
    return this.costCalculator;
  }
}
