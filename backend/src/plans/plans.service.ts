import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../entities/plan.entity';
import { UserPlan, UserPlanStatus } from '../entities/user-plan.entity';
import { PlanUsageDaily } from '../entities/plan-usage-daily.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(UserPlan)
    private readonly userPlanRepo: Repository<UserPlan>,
    @InjectRepository(PlanUsageDaily)
    private readonly usageRepo: Repository<PlanUsageDaily>,
  ) {}

  async getAvailablePlans() {
    return this.planRepo.find({
      where: { isActive: true },
      order: { monthlyPriceUsd: 'ASC', pointsIncluded: 'ASC' },
    });
  }

  async getCurrentPlanForUser(userId: string) {
    const userPlan = await this.userPlanRepo.findOne({
      where: { userId, status: UserPlanStatus.ACTIVE },
      relations: ['plan'],
      order: { startedAt: 'DESC' },
    });
    return userPlan;
  }

  async getUsageForUser(userId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.usageRepo.find({
      where: {
        userId,
        date: (dt: any) => dt >= since.toISOString().slice(0, 10),
      } as any,
      order: { date: 'ASC' },
    });
  }
}

