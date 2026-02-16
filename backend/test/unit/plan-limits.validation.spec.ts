import { HttpException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { validateScanStart, validateStep } from '../../src/plans/plan-limits.validation';
import { getPlanDefinition } from '../../src/config/plans.config';
import type { PlanId } from '../../src/config/plans.config';

describe('plan-limits.validation', () => {
  describe('validateScanStart', () => {
    it('does not throw when under worker and session limits', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 0,
          sessionsStartedToday: 0,
        }),
      ).not.toThrow();
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 0,
          sessionsStartedToday: 2,
        }),
      ).not.toThrow();
    });

    it('throws when currentWorkerCount >= limits.workers', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 1,
          sessionsStartedToday: 0,
        }),
      ).toThrow(HttpException);
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 1,
          sessionsStartedToday: 0,
        }),
      ).toThrow(/maximum 1 concurrent scan/);
    });

    it('throws when sessionsStartedToday >= sessions_per_day for FREE', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 0,
          sessionsStartedToday: 3,
        }),
      ).toThrow(HttpException);
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 0,
          sessionsStartedToday: 3,
        }),
      ).toThrow(/maximum 3 sessions per day/);
    });

    it('does not throw for PRO when at 4 workers (under limit 5)', () => {
      const planId: PlanId = 'PRO';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 4,
          sessionsStartedToday: 100,
        }),
      ).not.toThrow();
    });

    it('throws for PRO when currentWorkerCount >= 5', () => {
      const planId: PlanId = 'PRO';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 5,
          sessionsStartedToday: 0,
        }),
      ).toThrow(/maximum 5 concurrent scan/);
    });
  });

  describe('validateStep', () => {
    it('does not throw when steps_per_session is -1 (unlimited for all plans)', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(limits.steps_per_session).toBe(-1);
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 1,
          lastStepAtMs: 0,
        }),
      ).not.toThrow();
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 500,
          lastStepAtMs: Date.now(),
        }),
      ).not.toThrow();
    });

    it('throws when stepNumber > steps_per_session when limit is set', () => {
      const planId: PlanId = 'FREE';
      const limits = { ...getPlanDefinition(planId).limits, steps_per_session: 10 };
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 11,
          lastStepAtMs: Date.now(),
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 11,
          lastStepAtMs: Date.now(),
        }),
      ).toThrow(/maximum 10 steps per session/);
    });

    it('throws when cooldown not elapsed (when cooldown is set)', () => {
      const planId: PlanId = 'FREE';
      const limits = { ...getPlanDefinition(planId).limits, cooldown_between_steps_seconds: 1 };
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 2,
          lastStepAtMs: Date.now() - 200, // 0.2s ago
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 2,
          lastStepAtMs: Date.now() - 200,
        }),
      ).toThrow(/wait.*between steps/);
    });
  });
});
