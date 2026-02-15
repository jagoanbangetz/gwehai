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
          sessionsStartedToday: 4,
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
          sessionsStartedToday: 5,
        }),
      ).toThrow(HttpException);
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 0,
          sessionsStartedToday: 5,
        }),
      ).toThrow(/maximum 5 sessions per day/);
    });

    it('does not throw for PRO when at 3 workers (at limit)', () => {
      const planId: PlanId = 'PRO';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 2,
          sessionsStartedToday: 100,
        }),
      ).not.toThrow();
    });

    it('throws for PRO when currentWorkerCount >= 3', () => {
      const planId: PlanId = 'PRO';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateScanStart(planId, limits, {
          currentWorkerCount: 3,
          sessionsStartedToday: 0,
        }),
      ).toThrow(/maximum 3 concurrent scan/);
    });
  });

  describe('validateStep', () => {
    it('does not throw when step within steps_per_session', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 1,
          lastStepAtMs: 0,
        }),
      ).not.toThrow();
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 15,
          lastStepAtMs: Date.now() - 2000,
        }),
      ).not.toThrow();
    });

    it('throws when stepNumber > steps_per_session', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 16,
          lastStepAtMs: Date.now(),
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 16,
          lastStepAtMs: Date.now(),
        }),
      ).toThrow(/maximum 15 steps per session/);
    });

    it('throws when cooldown not elapsed for FREE', () => {
      const planId: PlanId = 'FREE';
      const limits = getPlanDefinition(planId).limits;
      expect(limits.cooldown_between_steps_seconds).toBe(1);
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

    it('does not throw for PRO step (no cooldown)', () => {
      const planId: PlanId = 'PRO';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 40,
          lastStepAtMs: 0,
        }),
      ).not.toThrow();
    });

    it('throws for PRO when stepNumber > 40', () => {
      const planId: PlanId = 'PRO';
      const limits = getPlanDefinition(planId).limits;
      expect(() =>
        validateStep(planId, limits, {
          stepNumber: 41,
          lastStepAtMs: Date.now(),
        }),
      ).toThrow(/maximum 40 steps per session/);
    });
  });
});
