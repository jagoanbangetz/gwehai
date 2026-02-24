import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserPointBalance } from '../entities/user-point-balance.entity';
import { PointLedger, PointLedgerType, PointLedgerReason } from '../entities/point-ledger.entity';
import { Subscription } from '../entities/subscription.entity';
import { POINTS_ENABLED } from '../config/plan-billing.config';

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(UserPointBalance)
    private balanceRepo: Repository<UserPointBalance>,
    @InjectRepository(PointLedger)
    private ledgerRepo: Repository<PointLedger>,
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
    private dataSource: DataSource,
  ) {}

  /** When false, plan-based quotas are the source of truth; no point deductions run. */
  isPointsEnabled(): boolean {
    return POINTS_ENABLED;
  }

  /**
   * Get current point balance for a user (including subscription allowance)
   */
  async getBalance(userId: string): Promise<number> {
    // Get cached balance
    let balance = await this.balanceRepo.findOne({
      where: { userId },
    });

    if (!balance) {
      // Initialize balance if doesn't exist
      balance = this.balanceRepo.create({
        userId,
        balance: 0,
      });
      await this.balanceRepo.save(balance);
    }

    // Check for active subscription with monthly points
    const activeSubscription = await this.subscriptionRepo.findOne({
      where: {
        userId,
        status: 'active' as any,
      },
    });

    // For now, return cached balance
    // In production, you might want to calculate from ledger for accuracy
    return this.normalizePoints(Number(balance.balance || 0));
  }

  /**
   * Grant points to a user (ACID-safe)
   */
  async grantPoints(
    userId: string,
    amount: number,
    reason: PointLedgerReason,
    refTable?: string,
    refId?: string,
    metadata?: Record<string, any>,
  ): Promise<PointLedger> {
    const normalizedAmount = this.normalizePoints(amount);
    if (normalizedAmount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return await this.dataSource.transaction(async (manager) => {
      // Create ledger entry
      const ledgerEntry = manager.create(PointLedger, {
        userId,
        deltaPoints: normalizedAmount,
        type: PointLedgerType.GRANT,
        reason,
        refTable,
        refId,
        metadata,
      });
      await manager.save(ledgerEntry);

      // Update cached balance (with lock)
      const balance = await manager.findOne(UserPointBalance, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (balance) {
        const nextBalance = this.normalizePoints(
          Number(balance.balance || 0) + normalizedAmount,
        );
        balance.balance = nextBalance;
        await manager.save(balance);
      } else {
        const newBalance = manager.create(UserPointBalance, {
          userId,
          balance: normalizedAmount,
        });
        await manager.save(newBalance);
      }

      return ledgerEntry;
    });
  }

  /**
   * Spend points from a user (ACID-safe, with balance check).
   * When POINTS_ENABLED=false, no deduction is executed (plan-based quotas are used instead).
   */
  async spendPoints(
    userId: string,
    amount: number,
    reason: PointLedgerReason,
    refTable?: string,
    refId?: string,
    metadata?: Record<string, any>,
  ): Promise<PointLedger | null> {
    if (!POINTS_ENABLED) {
      return Promise.resolve(null);
    }
    const normalizedAmount = this.normalizePoints(amount);
    if (normalizedAmount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return await this.dataSource.transaction(async (manager) => {
      // Lock and check balance
      const balance = await manager.findOne(UserPointBalance, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      const currentBalance = this.normalizePoints(
        Number(balance?.balance || 0),
      );

      // Check if user has enough points
      if (currentBalance < normalizedAmount) {
        throw new BadRequestException(
          `Insufficient points. Required: ${normalizedAmount}, Available: ${currentBalance}`,
        );
      }

      // Create ledger entry
      const ledgerEntry = manager.create(PointLedger, {
        userId,
        deltaPoints: -normalizedAmount,
        type: PointLedgerType.SPEND,
        reason,
        refTable,
        refId,
        metadata,
      });
      await manager.save(ledgerEntry);

      // Update cached balance
      if (balance) {
        balance.balance = this.normalizePoints(currentBalance - normalizedAmount);
        await manager.save(balance);
      } else {
        throw new NotFoundException('User balance not found');
      }

      return ledgerEntry;
    });
  }

  /**
   * Reserve credits (deduct estimated amount). Use refTable='usage_reserve', refId=messageId for later settle.
   * When POINTS_ENABLED=false, no-op and returns null.
   */
  async reserveCredits(
    userId: string,
    amount: number,
    refId: string,
    metadata?: Record<string, any>,
  ): Promise<PointLedger | null> {
    return this.spendPoints(
      userId,
      amount,
      PointLedgerReason.CHAT_USAGE,
      'usage_reserve',
      refId,
      { ...metadata, reserved: true },
    );
  }

  /**
   * Settle after actual usage: refund if actual < reserved, charge extra if actual > reserved.
   * Idempotent: if a ledger entry already exists with refTable='usage_settlement', refId=refId, no-op.
   */
  async settleCredits(
    userId: string,
    refId: string,
    reservedAmount: number,
    actualCredits: number,
  ): Promise<void> {
    if (!POINTS_ENABLED) return;
    const diff = actualCredits - reservedAmount;
    if (diff === 0) return;

    const existing = await this.ledgerRepo.findOne({
      where: { userId, refTable: 'usage_settlement', refId },
    });
    if (existing) return;

    if (diff < 0) {
      await this.refundPoints(userId, -diff, 'usage_settlement', refId);
    } else {
      await this.spendPoints(userId, diff, PointLedgerReason.CHAT_USAGE, 'usage_settlement', refId);
    }
  }

  /**
   * Refund points (ACID-safe). Uses PointLedgerType.REFUND.
   */
  async refundPoints(
    userId: string,
    amount: number,
    refTable?: string,
    refId?: string,
    metadata?: Record<string, any>,
  ): Promise<PointLedger | null> {
    if (!POINTS_ENABLED) return Promise.resolve(null);
    const normalizedAmount = this.normalizePoints(amount);
    if (normalizedAmount <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    return await this.dataSource.transaction(async (manager) => {
      const ledgerEntry = manager.create(PointLedger, {
        userId,
        deltaPoints: normalizedAmount,
        type: PointLedgerType.REFUND,
        reason: PointLedgerReason.REFUND,
        refTable,
        refId,
        metadata,
      });
      await manager.save(ledgerEntry);

      const balance = await manager.findOne(UserPointBalance, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (balance) {
        balance.balance = this.normalizePoints(Number(balance.balance || 0) + normalizedAmount);
        await manager.save(balance);
      } else {
        const newBalance = manager.create(UserPointBalance, {
          userId,
          balance: normalizedAmount,
        });
        await manager.save(newBalance);
      }
      return ledgerEntry;
    });
  }

  /**
   * Get ledger history for a user
   */
  async getLedgerHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ entries: PointLedger[]; total: number }> {
    const [entries, total] = await this.ledgerRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { entries, total };
  }

  private normalizePoints(amount: number): number {
    return Number(Number(amount || 0).toFixed(2));
  }
}
