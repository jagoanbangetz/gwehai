/**
 * Plan system: definitions, limits, and marketing copy.
 * Plan IDs: FREE, PRO, PRO_PLUS, ULTRA.
 * Used for plan resolution and limit enforcement (session start, step start).
 */

export type PlanId = 'FREE' | 'PRO' | 'PRO_PLUS' | 'ULTRA';

export interface PlanLimits {
  /** Concurrent targets (scans) at once */
  workers: number;
  /** -1 = unlimited */
  sessions_per_day: number;
  /** -1 = unlimited for all plans — scan runs until checklist is done */
  steps_per_session: number;
  /** Max sub-agents spawnable in one run (0 = cannot spawn). -1 = unlimited */
  max_sub_agents: number;
  tokens_per_step_total: number;
  max_output_tokens: number;
  /** -1 = unlimited */
  tokens_per_day: number;
  cooldown_between_steps_seconds: number;
  /** PRO_PLUS: priority queue for jobs */
  priority_queue?: boolean;
  /** ULTRA: throttle when soft cap reached */
  throttle_on_soft_cap?: boolean;
}

export interface PlanDefinition {
  planId: PlanId;
  limits: PlanLimits;
  marketing_title: string;
  marketing_bullets: string[];
  marketing_footnote: string;
  /** Monthly price USD; 0 = Free. Used by GET /plans/tiers for display. */
  monthlyPriceUsd?: number;
}

const MARKETING_FOOTNOTE = '*Fair usage policy applies';

export const PLANS: Record<PlanId, PlanDefinition> = {
  FREE: {
    planId: 'FREE',
    limits: {
      workers: 1,
      sessions_per_day: 3,
      steps_per_session: -1,
      max_sub_agents: 0,
      tokens_per_step_total: 2000,
      max_output_tokens: 200,
      tokens_per_day: 30000,
      cooldown_between_steps_seconds: 0,
    },
    marketing_title: 'Free',
    marketing_bullets: ['Unlimited steps per scan', '1 target at a time', '3 targets per day', 'No sub-agents'],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 0,
  },
  PRO: {
    planId: 'PRO',
    limits: {
      workers: 5,
      sessions_per_day: -1,
      steps_per_session: -1,
      max_sub_agents: 3,
      tokens_per_step_total: 6000,
      max_output_tokens: 400,
      tokens_per_day: 250000,
      cooldown_between_steps_seconds: 0,
    },
    marketing_title: 'Pro',
    marketing_bullets: ['Unlimited steps', '5 concurrent targets', 'Spawn up to 3 sub-agents'],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 19,
  },
  PRO_PLUS: {
    planId: 'PRO_PLUS',
    limits: {
      workers: 10,
      sessions_per_day: -1,
      steps_per_session: -1,
      max_sub_agents: 6,
      tokens_per_step_total: 10000,
      max_output_tokens: 700,
      tokens_per_day: 1000000,
      cooldown_between_steps_seconds: 0,
      priority_queue: true,
    },
    marketing_title: 'Pro Plus',
    marketing_bullets: ['Unlimited steps', '10 concurrent targets', 'Spawn up to 6 sub-agents', 'Priority queue'],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 49,
  },
  ULTRA: {
    planId: 'ULTRA',
    limits: {
      workers: 50,
      sessions_per_day: -1,
      steps_per_session: -1,
      max_sub_agents: -1,
      tokens_per_step_total: 14000,
      max_output_tokens: 1200,
      tokens_per_day: 5000000,
      cooldown_between_steps_seconds: 0,
      throttle_on_soft_cap: true,
    },
    marketing_title: 'Ultra',
    marketing_bullets: ['Unlimited steps', 'Unlimited concurrent targets', 'Unlimited sub-agents'],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 99,
  },
};

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  const def = PLANS[planId];
  if (!def) return PLANS.FREE;
  return def;
}

/**
 * Build limits_summary for API response (user-facing strings).
 * workers = concurrent targets, scans = targets/day, steps = per scan (unlimited for all), sub_agents = spawnable.
 */
export function getLimitsSummary(planId: PlanId): {
  workers: string;
  scans: string;
  steps: string;
  sub_agents: string;
} {
  const def = PLANS[planId] ?? PLANS.FREE;
  const { limits } = def;
  const unlimitedStar = 'Unlimited*';
  return {
    workers:
      limits.workers >= 50 || (limits as any).workers === -1
        ? unlimitedStar
        : String(limits.workers),
    scans:
      limits.sessions_per_day === -1
        ? unlimitedStar
        : `${limits.sessions_per_day}/day`,
    steps: unlimitedStar,
    sub_agents:
      limits.max_sub_agents === -1
        ? unlimitedStar
        : String(limits.max_sub_agents),
  };
}

/**
 * Plan + limits_summary for API response extension.
 */
export function getPlanPayload(planId: PlanId): {
  plan: {
    id: PlanId;
    marketing_title: string;
    marketing_footnote: string;
  };
  limits_summary: {
    workers: string;
    scans: string;
    steps: string;
    sub_agents: string;
  };
} {
  const def = PLANS[planId] ?? PLANS.FREE;
  return {
    plan: {
      id: def.planId,
      marketing_title: def.marketing_title,
      marketing_footnote: def.marketing_footnote,
    },
    limits_summary: getLimitsSummary(planId),
  };
}

/** Plan IDs in display order (FREE, PRO, PRO_PLUS, ULTRA). */
const PLAN_IDS_ORDER: PlanId[] = ['FREE', 'PRO', 'PRO_PLUS', 'ULTRA'];

/**
 * Returns config-based tiers for public display (Pricing page, upgrade modal).
 * Single source of truth for workers/scans/steps; adjust limits in PLANS above.
 */
export function getPlanTiers(): Array<{
  id: PlanId;
  name: string;
  priceMonthly: number;
  features: string[];
  limitsSummary: { workers: string; scans: string; steps: string; sub_agents: string };
  popular?: boolean;
}> {
  return PLAN_IDS_ORDER.map((id) => {
    const def = PLANS[id];
    const limitsSummary = getLimitsSummary(id);
    return {
      id,
      name: def.marketing_title,
      priceMonthly: def.monthlyPriceUsd ?? 0,
      features: def.marketing_bullets.length
        ? def.marketing_bullets
        : [
            `${limitsSummary.workers} concurrent target${limitsSummary.workers === '1' ? '' : 's'}`,
            `${limitsSummary.scans} per day`,
            `${limitsSummary.steps} steps per scan`,
            `${limitsSummary.sub_agents} sub-agent${limitsSummary.sub_agents === '1' ? '' : 's'}`,
          ],
      limitsSummary,
      popular: id === 'PRO_PLUS',
    };
  });
}
