/**
 * Centralized validation for plan-based scanning limits.
 * All scan start and step validations go through here so limits are adjustable in plans.config.ts.
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { PlanId } from '../config/plans.config';
import type { PlanLimits } from '../config/plans.config';

export interface ScanStartContext {
  currentWorkerCount: number;
  sessionsStartedToday: number;
}

/**
 * Validates that the user can start a new scan under their plan.
 * Throws HttpException (TOO_MANY_REQUESTS) if workers or sessions_per_day limit exceeded.
 */
export function validateScanStart(
  planId: PlanId,
  limits: PlanLimits,
  ctx: ScanStartContext,
): void {
  if (ctx.currentWorkerCount >= limits.workers) {
    throw new HttpException(
      `Plan limit: maximum ${limits.workers} concurrent scan(s). Wait for one to finish or upgrade.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (limits.sessions_per_day !== -1 && ctx.sessionsStartedToday >= limits.sessions_per_day) {
    throw new HttpException(
      `Plan limit: maximum ${limits.sessions_per_day} sessions per day. Upgrade for more.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface StepContext {
  stepNumber: number;
  lastStepAtMs: number;
}

/**
 * Validates that the user can run the next step in a session under their plan.
 * Throws BadRequestException if steps_per_session or cooldown exceeded.
 */
export function validateStep(
  planId: PlanId,
  limits: PlanLimits,
  ctx: StepContext,
): void {
  if (limits.steps_per_session !== -1 && ctx.stepNumber > limits.steps_per_session) {
    throw new BadRequestException(
      `Plan limit: maximum ${limits.steps_per_session} steps per session. Upgrade for more.`,
    );
  }
  if (limits.cooldown_between_steps_seconds > 0 && ctx.stepNumber > 1) {
    const elapsed = (Date.now() - ctx.lastStepAtMs) / 1000;
    if (elapsed < limits.cooldown_between_steps_seconds) {
      throw new BadRequestException(
        `Please wait ${limits.cooldown_between_steps_seconds - Math.ceil(elapsed)}s between steps (plan limit).`,
      );
    }
  }
}
