import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from '../entities/plan.entity';
import { UserPlan } from '../entities/user-plan.entity';
import { PlanUsageDaily } from '../entities/plan-usage-daily.entity';
import { User } from '../entities/user.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlansPublicController } from './plans-public.controller';
import { PlanResolutionService } from './plan-resolution.service';
import { PlanUsageService } from './plan-usage.service';
import { PlanQuotaUsageDaily } from '../entities/plan-quota-usage-daily.entity';
import { PlanQuotaUsageSession } from '../entities/plan-quota-usage-session.entity';
import { UserPointBalance } from '../entities/user-point-balance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plan,
      UserPlan,
      PlanUsageDaily,
      User,
      UserPointBalance,
      PlanQuotaUsageDaily,
      PlanQuotaUsageSession,
    ]),
  ],
  providers: [PlansService, PlanResolutionService, PlanUsageService],
  controllers: [PlansController, PlansPublicController],
  exports: [PlansService, PlanResolutionService, PlanUsageService],
})
export class PlansModule {}

