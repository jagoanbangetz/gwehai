/**
 * Snapshot types for versioned billing config (consistent per job/run).
 */

export interface BillingModelSnapshot {
  id: string;
  key: string;
  provider: string;
  enabled: boolean;
  supportsPromptCache: boolean;
  priceInPer1M: number;
  priceOutPer1M: number;
  priceCachedInPer1M: number | null;
  toolCallFeeUsd: number | null;
  minCostCredits: number | null;
}

export interface BillingPolicySnapshot {
  id: string;
  creditUsd: number;
  defaultRetryFactor: number;
  defaultPlatformFeeUsd: number;
  minCreditsPerOp: Record<string, number>;
}

export interface PlanBillingRuleSnapshot {
  planId: string;
  planMarkup: number;
  maxCreditsPerRun: number;
  maxTokensPerRun: number;
  maxStepsPerRun: number;
  allowedModels: string[];
  opMultipliers: Record<string, number>;
  modelMultiplierOverrides: Record<string, number> | null;
  opRetryFactorOverrides: Record<string, number> | null;
  opPlatformFeeOverrides: Record<string, number> | null;
}

export interface BillingConfigSnapshot {
  version: number;
  creditUsd: number;
  policy: BillingPolicySnapshot;
  models: BillingModelSnapshot[];
  planRules: Record<string, PlanBillingRuleSnapshot>;
}
