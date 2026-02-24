import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../entities/user.entity';
import { BillingConfigService } from '../billing/billing-config.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmModel } from '../entities/llm-model.entity';
import { BillingPolicy } from '../entities/billing-policy.entity';
import { PlanBillingRule } from '../entities/plan-billing-rule.entity';
import { PlanId, PLANS } from '../config/plans.config';

const REQUIRED_OPS = ['chat_turn', 'agent_step', 'scan_start', 'report'];

@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBillingConfigController {
  constructor(
    private readonly billingConfig: BillingConfigService,
    @InjectRepository(LlmModel)
    private readonly llmModelRepo: Repository<LlmModel>,
    @InjectRepository(BillingPolicy)
    private readonly policyRepo: Repository<BillingPolicy>,
    @InjectRepository(PlanBillingRule)
    private readonly planRulesRepo: Repository<PlanBillingRule>,
  ) {}

  @Get('config')
  async getConfig() {
    const snapshot = await this.billingConfig.getSnapshot();
    return {
      version: snapshot.version,
      creditUsd: snapshot.creditUsd,
      policy: snapshot.policy,
      models: snapshot.models,
      planRules: snapshot.planRules,
    };
  }

  @Put('models')
  async putModels(@Body() body: { models: Array<Partial<LlmModel> & { id: string }> }) {
    if (!body.models || !Array.isArray(body.models)) {
      throw new BadRequestException('body.models must be an array');
    }
    const modelKeys = await this.llmModelRepo.find({ select: ['key'] }).then((r) => r.map((m) => m.key));
    for (const m of body.models) {
      if (m.key && !modelKeys.includes(m.key)) {
        modelKeys.push(m.key);
      }
    }
    for (const row of body.models) {
      if (!row.id) throw new BadRequestException('Each model must have id');
      const existing = await this.llmModelRepo.findOne({ where: { id: row.id } });
      if (!existing) throw new BadRequestException(`Model not found: ${row.id}`);
      if (row.enabled !== undefined) existing.enabled = row.enabled;
      if (row.supportsPromptCache !== undefined) existing.supportsPromptCache = row.supportsPromptCache;
      if (row.priceInPer1M !== undefined) existing.priceInPer1M = row.priceInPer1M as any;
      if (row.priceOutPer1M !== undefined) existing.priceOutPer1M = row.priceOutPer1M as any;
      if (row.priceCachedInPer1M !== undefined) existing.priceCachedInPer1M = row.priceCachedInPer1M as any;
      if (row.toolCallFeeUsd !== undefined) existing.toolCallFeeUsd = row.toolCallFeeUsd as any;
      if (row.minCostCredits !== undefined) existing.minCostCredits = row.minCostCredits;
      await this.llmModelRepo.save(existing);
    }
    const version = await this.billingConfig.bumpVersion();
    return { version, message: 'Models updated' };
  }

  @Put('policy')
  async putPolicy(
    @Body()
    body: {
      creditUsd?: number;
      defaultRetryFactor?: number;
      defaultPlatformFeeUsd?: number;
      minCreditsPerOp?: Record<string, number>;
    },
  ) {
    const policy = await this.policyRepo.findOne({ where: { isActive: true } });
    if (!policy) throw new BadRequestException('No active billing policy found');
    if (body.creditUsd !== undefined) {
      if (typeof body.creditUsd !== 'number' || body.creditUsd <= 0) {
        throw new BadRequestException('creditUsd must be a positive number');
      }
      policy.creditUsd = body.creditUsd as any;
    }
    if (body.defaultRetryFactor !== undefined) policy.defaultRetryFactor = body.defaultRetryFactor as any;
    if (body.defaultPlatformFeeUsd !== undefined) policy.defaultPlatformFeeUsd = body.defaultPlatformFeeUsd as any;
    if (body.minCreditsPerOp !== undefined) {
      const m = body.minCreditsPerOp;
      for (const op of REQUIRED_OPS) {
        if (m[op] === undefined || typeof m[op] !== 'number' || m[op] < 0) {
          throw new BadRequestException(`minCreditsPerOp.${op} must be a non-negative number`);
        }
      }
      policy.minCreditsPerOp = m as any;
    }
    await this.policyRepo.save(policy);
    const version = await this.billingConfig.bumpVersion();
    return { version, message: 'Policy updated' };
  }

  @Put('plan-rules')
  async putPlanRules(
    @Body()
    body: {
      rules: Array<{
        planId: PlanId;
        planMarkup?: number;
        maxCreditsPerRun?: number;
        maxTokensPerRun?: number;
        maxStepsPerRun?: number;
        allowedModels?: string[];
        opMultipliers?: Record<string, number>;
        modelMultiplierOverrides?: Record<string, number> | null;
        opRetryFactorOverrides?: Record<string, number> | null;
        opPlatformFeeOverrides?: Record<string, number> | null;
      }>;
    },
  ) {
    if (!body.rules || !Array.isArray(body.rules)) {
      throw new BadRequestException('body.rules must be an array');
    }
    const modelKeys = await this.llmModelRepo.find({ select: ['key'] }).then((r) => r.map((m) => m.key));
    const validPlanIds = Object.keys(PLANS) as PlanId[];

    for (const r of body.rules) {
      if (!r.planId || !validPlanIds.includes(r.planId)) {
        throw new BadRequestException(`Invalid planId: ${r.planId}`);
      }
      if (r.maxCreditsPerRun !== undefined && (r.maxCreditsPerRun < 0 || !Number.isInteger(r.maxCreditsPerRun))) {
        throw new BadRequestException('maxCreditsPerRun must be a non-negative integer');
      }
      if (r.maxTokensPerRun !== undefined && (r.maxTokensPerRun < 0 || !Number.isInteger(r.maxTokensPerRun))) {
        throw new BadRequestException('maxTokensPerRun must be a non-negative integer');
      }
      if (r.maxStepsPerRun !== undefined && (r.maxStepsPerRun < 0 || !Number.isInteger(r.maxStepsPerRun))) {
        throw new BadRequestException('maxStepsPerRun must be a non-negative integer');
      }
      if (r.allowedModels !== undefined) {
        for (const key of r.allowedModels) {
          if (!modelKeys.includes(key)) {
            throw new BadRequestException(`allowedModels references unknown model key: ${key}`);
          }
        }
      }
    }

    for (const row of body.rules) {
      let rule = await this.planRulesRepo.findOne({ where: { planId: row.planId } });
      if (!rule) {
        rule = this.planRulesRepo.create({
          planId: row.planId,
          planMarkup: 3.0,
          maxCreditsPerRun: 100000,
          maxTokensPerRun: 500000,
          maxStepsPerRun: 500,
          allowedModels: [],
          opMultipliers: {},
        });
      }
      if (row.planMarkup !== undefined) rule.planMarkup = row.planMarkup as any;
      if (row.maxCreditsPerRun !== undefined) rule.maxCreditsPerRun = row.maxCreditsPerRun;
      if (row.maxTokensPerRun !== undefined) rule.maxTokensPerRun = row.maxTokensPerRun;
      if (row.maxStepsPerRun !== undefined) rule.maxStepsPerRun = row.maxStepsPerRun;
      if (row.allowedModels !== undefined) rule.allowedModels = row.allowedModels as any;
      if (row.opMultipliers !== undefined) rule.opMultipliers = row.opMultipliers as any;
      if (row.modelMultiplierOverrides !== undefined) rule.modelMultiplierOverrides = row.modelMultiplierOverrides as any;
      if (row.opRetryFactorOverrides !== undefined) rule.opRetryFactorOverrides = row.opRetryFactorOverrides as any;
      if (row.opPlatformFeeOverrides !== undefined) rule.opPlatformFeeOverrides = row.opPlatformFeeOverrides as any;
      await this.planRulesRepo.save(rule);
    }
    const version = await this.billingConfig.bumpVersion();
    return { version, message: 'Plan rules updated' };
  }
}
