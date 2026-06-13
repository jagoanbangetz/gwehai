import { ConfigService } from '@nestjs/config';
import { CostManagerService } from '../../src/llm/cost-manager.service';

describe('CostManagerService', () => {
  const createService = (env: Record<string, string> = {}) => {
    const config = {
      get: jest.fn((key: string) => env[key] ?? undefined),
    };
    return new CostManagerService(config as unknown as ConfigService);
  };

  describe('getCaps', () => {
    it('returns decision caps for auto (DeepSeek): 300 output, 8000 input by default', () => {
      const service = createService();
      const caps = service.getCaps('auto', 'decision');
      expect(caps.maxOutputTokens).toBe(300);
      expect(caps.maxInputTokens).toBe(8000);
    });

    it('returns long caps for auto: 800 output when mode is long', () => {
      const service = createService({ MAX_OUTPUT_TOKENS_LONG: '800' });
      const caps = service.getCaps('auto', 'long');
      expect(caps.maxOutputTokens).toBe(800);
      expect(caps.maxInputTokens).toBe(8000);
    });

    it('returns paid input budget for deepseek', () => {
      const service = createService({ MAX_INPUT_TOKENS_PAID: '8000' });
      const caps = service.getCaps('deepseek_v4', 'decision');
      expect(caps.maxOutputTokens).toBe(300);
      expect(caps.maxInputTokens).toBe(8000);
    });
  });

  describe('getToolsOutputCap', () => {
    it('returns null when MAX_OUTPUT_TOKENS_TOOLS is not set', () => {
      const service = createService();
      expect(service.getToolsOutputCap()).toBe(null);
    });

    it('returns number when MAX_OUTPUT_TOKENS_TOOLS is set', () => {
      const service = createService({ MAX_OUTPUT_TOKENS_TOOLS: '15000' });
      expect(service.getToolsOutputCap()).toBe(15000);
    });
  });

  describe('getInputBudget', () => {
    it('returns 8000 for auto by default', () => {
      const service = createService();
      expect(service.getInputBudget('auto')).toBe(8000);
    });

    it('returns 8000 for deepseek by default', () => {
      const service = createService();
      expect(service.getInputBudget('deepseek_v4')).toBe(8000);
    });
  });

  describe('estimateCost', () => {
    it('returns null for unknown provider', () => {
      const service = createService();
      expect(service.estimateCost('unknown', 1000, 500)).toBe(null);
    });

    it('returns number for deepseek', () => {
      const service = createService();
      const cost = service.estimateCost('deepseek_v4', 1_000_000, 1_000_000);
      expect(cost).not.toBe(null);
      expect(typeof cost).toBe('number');
    });
  });
});
