import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmModel } from '../entities/llm-model.entity';
import { BillingPolicy } from '../entities/billing-policy.entity';
import { PlanBillingRule } from '../entities/plan-billing-rule.entity';
import { BillingConfigState } from '../entities/billing-config-state.entity';
import type {
  BillingConfigSnapshot,
  BillingModelSnapshot,
  BillingPolicySnapshot,
  PlanBillingRuleSnapshot,
} from './billing-config.types';
import { PlanId } from '../config/plans.config';

const BILLING_CONFIG_STATE_ID = 'a0000000-0000-0000-0000-000000000001';

@Injectable()
export class BillingConfigService {
  private cached: BillingConfigSnapshot | null = null;
  private cachedVersion: number | null = null;

  constructor(
    @InjectRepository(LlmModel)
    private readonly llmModelRepo: Repository<LlmModel>,
    @InjectRepository(BillingPolicy)
    private readonly policyRepo: Repository<BillingPolicy>,
    @InjectRepository(PlanBillingRule)
    private readonly planRulesRepo: Repository<PlanBillingRule>,
    @InjectRepository(BillingConfigState)
    private readonly stateRepo: Repository<BillingConfigState>,
  ) {}

  /**
   * Returns the current billing config snapshot (cached in memory; reloads when version changes).
   */
  async getSnapshot(): Promise<BillingConfigSnapshot> {
    const state = await this.stateRepo.findOne({ where: { id: BILLING_CONFIG_STATE_ID } });
    const version = state?.version ?? 1;
    if (this.cached !== null && this.cachedVersion === version) {
      return this.cached;
    }
    const policy = await this.policyRepo.findOne({ where: { isActive: true } });
    if (!policy) {
      throw new Error('No active billing policy found');
    }
    const models = await this.llmModelRepo.find({ order: { key: 'ASC' } });
    const planRules = await this.planRulesRepo.find();

    const policySnapshot: BillingPolicySnapshot = {
      id: policy.id,
      creditUsd: Number(policy.creditUsd),
      defaultRetryFactor: Number(policy.defaultRetryFactor),
      defaultPlatformFeeUsd: Number(policy.defaultPlatformFeeUsd),
      minCreditsPerOp: (policy.minCreditsPerOp as Record<string, number>) ?? {},
    };

    const modelsSnapshot: BillingModelSnapshot[] = models.map((m) => ({
      id: m.id,
      key: m.key,
      provider: m.provider,
      enabled: m.enabled,
      supportsPromptCache: m.supportsPromptCache,
      priceInPer1M: Number(m.priceInPer1M),
      priceOutPer1M: Number(m.priceOutPer1M),
      priceCachedInPer1M: m.priceCachedInPer1M != null ? Number(m.priceCachedInPer1M) : null,
      toolCallFeeUsd: m.toolCallFeeUsd != null ? Number(m.toolCallFeeUsd) : null,
      minCostCredits: m.minCostCredits ?? null,
    }));

    const planRulesMap: Record<string, PlanBillingRuleSnapshot> = {};
    for (const r of planRules) {
      planRulesMap[r.planId] = {
        planId: r.planId,
        planMarkup: Number(r.planMarkup),
        maxCreditsPerRun: r.maxCreditsPerRun,
        maxTokensPerRun: r.maxTokensPerRun,
        maxStepsPerRun: r.maxStepsPerRun,
        allowedModels: (r.allowedModels as string[]) ?? [],
        opMultipliers: (r.opMultipliers as Record<string, number>) ?? {},
        modelMultiplierOverrides: r.modelMultiplierOverrides as Record<string, number> | null ?? null,
        opRetryFactorOverrides: r.opRetryFactorOverrides as Record<string, number> | null ?? null,
        opPlatformFeeOverrides: r.opPlatformFeeOverrides as Record<string, number> | null ?? null,
      };
    }

    this.cached = {
      version,
      creditUsd: policySnapshot.creditUsd,
      policy: policySnapshot,
      models: modelsSnapshot,
      planRules: planRulesMap,
    };
    this.cachedVersion = version;
    return this.cached;
  }

  /**
   * Resolve which model key to use for a plan: must be enabled and in allowedModels; fallback to cheapest allowed enabled model.
   */
  async resolveModelForPlan(planId: PlanId, requestedModelKey?: string | null): Promise<string> {
    const snap = await this.getSnapshot();
    const rule = snap.planRules[planId] ?? snap.planRules.FREE;
    const allowed = rule.allowedModels ?? [];
    const modelsByKey = new Map(snap.models.map((m) => [m.key, m]));

    if (requestedModelKey) {
      const model = modelsByKey.get(requestedModelKey);
      if (model?.enabled && allowed.includes(requestedModelKey)) {
        return requestedModelKey;
      }
    }

    let cheapestKey: string | null = null;
    let cheapestOut = Infinity;
    for (const key of allowed) {
      const m = modelsByKey.get(key);
      if (!m?.enabled) continue;
      const outPrice = m.priceOutPer1M;
      if (outPrice < cheapestOut) {
        cheapestOut = outPrice;
        cheapestKey = key;
      }
    }
    if (cheapestKey) return cheapestKey;

    const firstEnabled = snap.models.find((m) => m.enabled);
    return firstEnabled?.key ?? 'deepseek-chat';
  }

  /**
   * Increment billing_config_state.version and clear cache so next getSnapshot() reloads.
   */
  async bumpVersion(): Promise<number> {
    const state = await this.stateRepo.findOne({ where: { id: BILLING_CONFIG_STATE_ID } });
    if (!state) {
      const newState = this.stateRepo.create({
        id: BILLING_CONFIG_STATE_ID,
        version: 1,
      });
      await this.stateRepo.save(newState);
      this.cached = null;
      this.cachedVersion = null;
      return 1;
    }
    state.version = (state.version ?? 1) + 1;
    await this.stateRepo.save(state);
    this.cached = null;
    this.cachedVersion = null;
    return state.version;
  }

  /** Clear in-memory cache (e.g. after tests). */
  clearCache(): void {
    this.cached = null;
    this.cachedVersion = null;
  }
}
