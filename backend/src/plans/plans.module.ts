import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from '../entities/plan.entity';
import { UserPlan } from '../entities/user-plan.entity';
import { PlanUsageDaily } from '../entities/plan-usage-daily.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, UserPlan, PlanUsageDaily])],
  providers: [PlansService],
  controllers: [PlansController],
  exports: [PlansService],
})
export class PlansModule {}

