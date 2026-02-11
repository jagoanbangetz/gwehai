import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserPointBalance } from '../entities/user-point-balance.entity';
import { PointLedger, PointLedgerType, PointLedgerReason } from '../entities/point-ledger.entity';
import { Subscription } from '../entities/subscription.entity';

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
   * Spend points from a user (ACID-safe, with balance check)
   */
  async spendPoints(
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
