import { Injectable } from '@nestjs/common';
import type { BillingConfigSnapshot, BillingModelSnapshot, PlanBillingRuleSnapshot } from './billing-config.types';
import { PlanId } from '../config/plans.config';

export type BillingOpType = 'chat_turn' | 'agent_step' | 'multi_agent' | 'exploit_refine' | 'scan_start' | 'report';

export interface ComputeCreditsInput {
  planId: PlanId;
  opType: BillingOpType;
  modelKey: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  toolCallCount?: number;
  /** If provided, credits will be capped to this run total (from plan rule). */
  runCreditsUsedSoFar?: number;
}

export interface ComputeCreditsResult {
  credits: number;
  capped: boolean;
  billableUsd: number;
  providerCostUsd: number;
}

@Injectable()
export class CostCalculatorService {
  /**
   * Compute credits for one operation using the given snapshot.
   * providerCostUsd = retryFactor * ((missIn/1e6)*priceIn + (cachedIn/1e6)*(priceCachedIn or priceIn) + (out/1e6)*priceOut) + toolFee
   * billableUsd = providerCostUsd * planMarkup * opMultiplier * modelMultiplier + platformFee
   * credits = max(minCreditsPerOp[op], ceil(billableUsd / creditUsd))
   * Then cap by planRules.maxCreditsPerRun (mark as capped).
   */
  computeCredits(snapshot: BillingConfigSnapshot, input: ComputeCreditsInput): ComputeCreditsResult {
    const model = snapshot.models.find((m) => m.key === input.modelKey);
    if (!model) {
      return {
        credits: 0,
        capped: false,
        billableUsd: 0,
        providerCostUsd: 0,
      };
    }

    const rule = snapshot.planRules[input.planId] ?? snapshot.planRules.FREE;
    if (!rule) {
      return { credits: 0, capped: false, billableUsd: 0, providerCostUsd: 0 };
    }

    const retryFactor = this.getOpOverride(rule.opRetryFactorOverrides, input.opType) ?? snapshot.policy.defaultRetryFactor;
    const platformFee = this.getOpOverride(rule.opPlatformFeeOverrides, input.opType) ?? snapshot.policy.defaultPlatformFeeUsd;

    const missIn = Math.max(0, input.inputTokens - (input.cachedInputTokens ?? 0));
    const cachedIn = input.cachedInputTokens ?? 0;
    const priceCached = model.priceCachedInPer1M ?? model.priceInPer1M;
    const providerCostUsd =
      retryFactor *
      ((missIn / 1e6) * model.priceInPer1M +
        (cachedIn / 1e6) * priceCached +
        (input.outputTokens / 1e6) * model.priceOutPer1M);
    const toolFee = (model.toolCallFeeUsd ?? 0) * (input.toolCallCount ?? 0);
    const rawProviderCost = providerCostUsd + toolFee;

    const opMultiplier = rule.opMultipliers[input.opType] ?? 1.0;
    const modelMultiplier = (rule.modelMultiplierOverrides && rule.modelMultiplierOverrides[input.modelKey]) ?? 1.0;
    const billableUsd = rawProviderCost * rule.planMarkup * opMultiplier * modelMultiplier + platformFee;

    const minCredits = snapshot.policy.minCreditsPerOp[input.opType] ?? 1;
    let credits = Math.max(minCredits, Math.ceil(billableUsd / snapshot.creditUsd));
    if (model.minCostCredits != null && model.minCostCredits > credits) {
      credits = model.minCostCredits;
    }

    let capped = false;
    const runUsed = input.runCreditsUsedSoFar ?? 0;
    if (runUsed + credits > rule.maxCreditsPerRun) {
      credits = Math.max(0, rule.maxCreditsPerRun - runUsed);
      capped = true;
    }

    return {
      credits,
      capped,
      billableUsd,
      providerCostUsd: rawProviderCost,
    };
  }

  /**
   * Estimate credits for a reserve (before LLM response). Uses max_output_tokens heuristic if available, else a default.
   */
  estimateOutputTokensForReserve(maxOutputTokens?: number): number {
    return maxOutputTokens ?? 1024;
  }

  private getOpOverride(overrides: Record<string, number> | null | undefined, opType: string): number | null {
    if (!overrides || overrides[opType] === undefined) return null;
    return overrides[opType];
  }
}
