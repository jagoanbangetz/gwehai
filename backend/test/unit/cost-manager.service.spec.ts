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
    it('returns decision caps for auto (groq): 300 output, 6000 input by default', () => {
      const service = createService();
      const caps = service.getCaps('auto', 'decision');
      expect(caps.maxOutputTokens).toBe(300);
      expect(caps.maxInputTokens).toBe(6000);
    });

    it('returns long caps for auto: 800 output when mode is long', () => {
      const service = createService({ MAX_OUTPUT_TOKENS_LONG: '800' });
      const caps = service.getCaps('auto', 'long');
      expect(caps.maxOutputTokens).toBe(800);
      expect(caps.maxInputTokens).toBe(6000);
    });

    it('returns paid input budget for non-auto (e.g. deepseek)', () => {
      const service = createService({ MAX_INPUT_TOKENS_PAID: '8000' });
      const caps = service.getCaps('deepseek', 'decision');
      expect(caps.maxOutputTokens).toBe(300);
      expect(caps.maxInputTokens).toBe(8000);
    });
  });

  describe('getInputBudget', () => {
    it('returns 6000 for auto by default', () => {
      const service = createService();
      expect(service.getInputBudget('auto')).toBe(6000);
    });

    it('returns 8000 for paid model by default', () => {
      const service = createService();
      expect(service.getInputBudget('deepseek')).toBe(8000);
    });

    it('respects MAX_INPUT_TOKENS_AUTO env', () => {
      const service = createService({ MAX_INPUT_TOKENS_AUTO: '4000' });
      expect(service.getInputBudget('auto')).toBe(4000);
    });
  });

  describe('shouldUseCheapModelForAuto', () => {
    it('returns true for short simple message', () => {
      const service = createService();
      expect(service.shouldUseCheapModelForAuto('Hi')).toBe(true);
      expect(service.shouldUseCheapModelForAuto('  Pentest example.com  ')).toBe(true);
    });

    it('returns false for long message (>1200 chars)', () => {
      const service = createService();
      const long = 'a'.repeat(1201);
      expect(service.shouldUseCheapModelForAuto(long)).toBe(false);
    });

    it('returns false when message has code block', () => {
      const service = createService();
      expect(service.shouldUseCheapModelForAuto('Check this:\n```\ncode\n```')).toBe(false);
    });

    it('returns false when message has multiple numbered requirements', () => {
      const service = createService();
      expect(service.shouldUseCheapModelForAuto('1. First\n2. Second\n3. Third')).toBe(false);
    });

    it('returns false for deep reasoning phrases', () => {
      const service = createService();
      expect(service.shouldUseCheapModelForAuto('Explain in detail how it works')).toBe(false);
      expect(service.shouldUseCheapModelForAuto('Reason step by step')).toBe(false);
      expect(service.shouldUseCheapModelForAuto('Analyze the code')).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('returns null for unknown provider', () => {
      const service = createService();
      expect(service.estimateCost('unknown', 1000, 500)).toBe(null);
    });

    it('returns number for groq', () => {
      const service = createService();
      const cost = service.estimateCost('groq', 1_000_000, 1_000_000);
      expect(cost).not.toBe(null);
      expect(typeof cost).toBe('number');
    });
  });
});
