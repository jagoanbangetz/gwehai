import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanQuotaUsageDaily } from '../entities/plan-quota-usage-daily.entity';
import { PlanQuotaUsageSession } from '../entities/plan-quota-usage-session.entity';
import { getPlanDefinition } from '../config/plans.config';
import type { PlanId } from '../config/plans.config';

export interface UsageSummary {
  session: {
    steps_used: number;
    steps_remaining: number | null;
    tokens_used: number;
  };
  day: {
    tokens_used: number;
    tokens_remaining: number | null;
  };
}

@Injectable()
export class PlanUsageService {
  constructor(
    @InjectRepository(PlanQuotaUsageDaily)
    private readonly dailyRepo: Repository<PlanQuotaUsageDaily>,
    @InjectRepository(PlanQuotaUsageSession)
    private readonly sessionRepo: Repository<PlanQuotaUsageSession>,
  ) {}

  /** Record that a session was started today (increment sessions_started_today). */
  async recordSessionStart(userId: string): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    let row = await this.dailyRepo.findOne({ where: { userId, date } });
    if (!row) {
      row = this.dailyRepo.create({ userId, date, sessionsStarted: 0, tokensUsed: 0 });
      await this.dailyRepo.save(row);
    }
    row.sessionsStarted = (row.sessionsStarted || 0) + 1;
    await this.dailyRepo.save(row);
  }

  /** Get or create session usage row; return current steps/tokens/lastStepAt. */
  async getOrCreateSession(userId: string, conversationId: string): Promise<PlanQuotaUsageSession> {
    let row = await this.sessionRepo.findOne({ where: { userId, conversationId } });
    if (!row) {
      row = this.sessionRepo.create({
        userId,
        conversationId,
        stepsUsed: 0,
        tokensUsed: 0,
      });
      await this.sessionRepo.save(row);
    }
    return row;
  }

  /** After a step: increment steps/tokens and set lastStepAt. Also add tokens to daily. */
  async recordStep(
    userId: string,
    conversationId: string,
    tokensThisStep: number,
  ): Promise<void> {
    const session = await this.getOrCreateSession(userId, conversationId);
    session.stepsUsed = (session.stepsUsed || 0) + 1;
    session.tokensUsed = (session.tokensUsed || 0) + tokensThisStep;
    session.lastStepAt = new Date();
    await this.sessionRepo.save(session);

    const date = new Date().toISOString().slice(0, 10);
    let daily = await this.dailyRepo.findOne({ where: { userId, date } });
    if (!daily) {
      daily = this.dailyRepo.create({ userId, date, sessionsStarted: 0, tokensUsed: 0 });
      await this.dailyRepo.save(daily);
    }
    daily.tokensUsed = (daily.tokensUsed || 0) + tokensThisStep;
    await this.dailyRepo.save(daily);
  }

  /** Get usage summary for API response (session + day). */
  async getUsage(
    userId: string,
    planId: PlanId,
    conversationId?: string,
  ): Promise<UsageSummary> {
    const def = getPlanDefinition(planId);
    const limits = def.limits;
    const date = new Date().toISOString().slice(0, 10);

    let sessionSteps = 0;
    let sessionTokens = 0;
    if (conversationId) {
      const session = await this.sessionRepo.findOne({
        where: { userId, conversationId },
      });
      if (session) {
        sessionSteps = session.stepsUsed || 0;
        sessionTokens = session.tokensUsed || 0;
      }
    }

    let dayTokens = 0;
    const daily = await this.dailyRepo.findOne({ where: { userId, date } });
    if (daily) dayTokens = daily.tokensUsed || 0;

    const stepsLimit = limits.steps_per_session === -1 ? null : limits.steps_per_session;
    const dayTokensLimit = limits.tokens_per_day === -1 ? null : limits.tokens_per_day;

    return {
      session: {
        steps_used: sessionSteps,
        steps_remaining: stepsLimit === null ? null : Math.max(0, stepsLimit - sessionSteps),
        tokens_used: sessionTokens,
      },
      day: {
        tokens_used: dayTokens,
        tokens_remaining: dayTokensLimit === null ? null : Math.max(0, dayTokensLimit - dayTokens),
      },
    };
  }

  /** Get sessions started today (for enforcement when not using in-memory only). */
  async getSessionsStartedToday(userId: string): Promise<number> {
    const date = new Date().toISOString().slice(0, 10);
    const row = await this.dailyRepo.findOne({ where: { userId, date } });
    return row?.sessionsStarted ?? 0;
  }
}
