import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserPointBalance } from '../entities/user-point-balance.entity';
import { PlanId, getPlanDefinition, PLANS } from '../config/plans.config';
import {
  PLAN_MIGRATION_FROM_POINTS,
  POINTS_FOR_ULTRA,
  POINTS_FOR_PRO_PLUS,
  POINTS_FOR_PRO,
} from '../config/plan-billing.config';

/**
 * Single place to resolve a user's plan ID.
 * Defaults to FREE if user has no planId set.
 * When PLAN_MIGRATION_FROM_POINTS=true, users with no planId get a plan from point balance.
 */
@Injectable()
export class PlanResolutionService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPointBalance)
    private readonly balanceRepo: Repository<UserPointBalance>,
  ) {}

  /**
   * Returns the plan ID for the user. Default FREE if not set.
   * Migration: when planId is null and PLAN_MIGRATION_FROM_POINTS is true, derive from point balance.
   */
  async getUserPlan(userId: string): Promise<PlanId> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'planId'],
    });
    const raw = user?.planId?.trim()?.toUpperCase();
    if (raw && (raw === 'FREE' || raw === 'PRO' || raw === 'PRO_PLUS' || raw === 'ULTRA')) {
      return raw as PlanId;
    }
    if (PLAN_MIGRATION_FROM_POINTS) {
      const balanceRow = await this.balanceRepo.findOne({ where: { userId } });
      const balance = Number(balanceRow?.balance ?? 0);
      if (balance >= POINTS_FOR_ULTRA) return 'ULTRA';
      if (balance >= POINTS_FOR_PRO_PLUS) return 'PRO_PLUS';
      if (balance >= POINTS_FOR_PRO) return 'PRO';
    }
    return 'FREE';
  }

  getPlanDefinition(planId: PlanId) {
    return getPlanDefinition(planId);
  }

  getPlansRegistry() {
    return PLANS;
  }
}
