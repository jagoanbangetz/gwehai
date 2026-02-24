import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSetting } from '../entities/admin-setting.entity';
import { LlmModel } from '../entities/llm-model.entity';
import { BillingPolicy } from '../entities/billing-policy.entity';
import { PlanBillingRule } from '../entities/plan-billing-rule.entity';
import { BillingConfigState } from '../entities/billing-config-state.entity';
import { BillingSettingsService } from './billing-settings.service';
import { BillingConfigService } from './billing-config.service';
import { CostCalculatorService } from './cost-calculator.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      AdminSetting,
      LlmModel,
      BillingPolicy,
      PlanBillingRule,
      BillingConfigState,
    ]),
  ],
  providers: [BillingSettingsService, BillingConfigService, CostCalculatorService],
  exports: [BillingSettingsService, BillingConfigService, CostCalculatorService],
})
export class BillingModule {}
