import { CostCalculatorService } from '../../src/billing/cost-calculator.service';
import type { BillingConfigSnapshot } from '../../src/billing/billing-config.types';

describe('CostCalculatorService', () => {
  let service: CostCalculatorService;

  const baseSnapshot: BillingConfigSnapshot = {
    version: 1,
    creditUsd: 0.01,
    policy: {
      id: 'policy-1',
      creditUsd: 0.01,
      defaultRetryFactor: 1.1,
      defaultPlatformFeeUsd: 0.002,
      minCreditsPerOp: { chat_turn: 1, agent_step: 2, scan_start: 10, report: 20 },
    },
    models: [
      {
        id: 'm1',
        key: 'deepseek-chat',
        provider: 'deepseek',
        enabled: true,
        supportsPromptCache: true,
        priceInPer1M: 0.14,
        priceOutPer1M: 0.28,
        priceCachedInPer1M: 0.014,
        toolCallFeeUsd: null,
        minCostCredits: null,
      },
      {
        id: 'm2',
        key: 'gpt-4o',
        provider: 'openai',
        enabled: true,
        supportsPromptCache: false,
        priceInPer1M: 2.5,
        priceOutPer1M: 10,
        priceCachedInPer1M: null,
        toolCallFeeUsd: 0.001,
        minCostCredits: 5,
      },
    ],
    planRules: {
      FREE: {
        planId: 'FREE',
        planMarkup: 3.0,
        maxCreditsPerRun: 5000,
        maxTokensPerRun: 50000,
        maxStepsPerRun: 100,
        allowedModels: ['deepseek-chat'],
        opMultipliers: { chat_turn: 1.0, agent_step: 1.8, multi_agent: 2.5, exploit_refine: 3.5 },
        modelMultiplierOverrides: { 'gpt-4o': 1.35 },
        opRetryFactorOverrides: null,
        opPlatformFeeOverrides: null,
      },
      PRO: {
        planId: 'PRO',
        planMarkup: 3.2,
        maxCreditsPerRun: 50000,
        maxTokensPerRun: 300000,
        maxStepsPerRun: 300,
        allowedModels: ['deepseek-chat', 'gpt-4o'],
        opMultipliers: { chat_turn: 1.0, agent_step: 1.8, multi_agent: 2.5, exploit_refine: 3.5 },
        modelMultiplierOverrides: { 'gpt-4o': 1.35 },
        opRetryFactorOverrides: null,
        opPlatformFeeOverrides: null,
      },
    },
  };

  beforeEach(() => {
    service = new CostCalculatorService();
  });

  describe('computeCredits', () => {
    it('computes credits for deepseek with cache miss (all input as miss)', () => {
      const result = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'chat_turn',
        modelKey: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(result.credits).toBeGreaterThanOrEqual(1);
      expect(result.capped).toBe(false);
      expect(result.providerCostUsd).toBeGreaterThan(0);
      expect(result.billableUsd).toBeGreaterThan(0);
    });

    it('uses cached input price when cachedInputTokens provided (cache hit)', () => {
      const missOnly = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'chat_turn',
        modelKey: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
      });
      const withCache = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'chat_turn',
        modelKey: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
        cachedInputTokens: 800,
      });
      expect(withCache.providerCostUsd).toBeLessThan(missOnly.providerCostUsd);
      expect(withCache.credits).toBeLessThanOrEqual(missOnly.credits);
    });

    it('applies expensive model multiplier for gpt-4o', () => {
      const deepseekCredits = service.computeCredits(baseSnapshot, {
        planId: 'PRO',
        opType: 'chat_turn',
        modelKey: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
      });
      const gpt4Credits = service.computeCredits(baseSnapshot, {
        planId: 'PRO',
        opType: 'chat_turn',
        modelKey: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(gpt4Credits.credits).toBeGreaterThan(deepseekCredits.credits);
      expect(gpt4Credits.credits).toBeGreaterThanOrEqual(5);
    });

    it('applies op multiplier for agent_step vs chat_turn', () => {
      const chatTurn = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'chat_turn',
        modelKey: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
      });
      const agentStep = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'agent_step',
        modelKey: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(agentStep.credits).toBeGreaterThan(chatTurn.credits);
    });

    it('caps credits by maxCreditsPerRun when runCreditsUsedSoFar is high', () => {
      const result = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'chat_turn',
        modelKey: 'deepseek-chat',
        inputTokens: 100_000,
        outputTokens: 50_000,
        runCreditsUsedSoFar: 4991,
      });
      expect(result.capped).toBe(true);
      expect(result.credits).toBe(9);
    });

    it('returns 0 credits for unknown model key', () => {
      const result = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'chat_turn',
        modelKey: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(result.credits).toBe(0);
      expect(result.billableUsd).toBe(0);
    });

    it('respects minCreditsPerOp', () => {
      const result = service.computeCredits(baseSnapshot, {
        planId: 'FREE',
        opType: 'report',
        modelKey: 'deepseek-chat',
        inputTokens: 10,
        outputTokens: 10,
      });
      expect(result.credits).toBeGreaterThanOrEqual(20);
    });
  });

  describe('estimateOutputTokensForReserve', () => {
    it('returns maxOutputTokens when provided', () => {
      expect(service.estimateOutputTokensForReserve(512)).toBe(512);
    });
    it('returns 1024 when not provided', () => {
      expect(service.estimateOutputTokensForReserve()).toBe(1024);
    });
  });
});
