/**
 * Plan system: definitions, limits, and marketing copy.
 * Plan IDs: FREE, PRO, PRO_PLUS, ULTRA.
 * Used for plan resolution and limit enforcement (session start, step start).
 */

export type PlanId = 'FREE' | 'PRO' | 'PRO_PLUS' | 'ULTRA';

export interface PlanLimits {
  workers: number;
  /** -1 = unlimited */
  sessions_per_day: number;
  /** -1 = unlimited (ULTRA uses soft cap internally) */
  steps_per_session: number;
  tokens_per_step_total: number;
  max_output_tokens: number;
  /** -1 = unlimited (ULTRA uses soft cap internally) */
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
      sessions_per_day: 5,
      steps_per_session: 15,
      tokens_per_step_total: 2000,
      max_output_tokens: 200,
      tokens_per_day: 30000,
      cooldown_between_steps_seconds: 1,
    },
    marketing_title: 'Free',
    marketing_bullets: [],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 0,
  },
  PRO: {
    planId: 'PRO',
    limits: {
      workers: 3,
      sessions_per_day: -1,
      steps_per_session: 40,
      tokens_per_step_total: 6000,
      max_output_tokens: 400,
      tokens_per_day: 250000,
      cooldown_between_steps_seconds: 0,
    },
    marketing_title: 'Pro',
    marketing_bullets: ['Unlimited Scans'],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 19,
  },
  PRO_PLUS: {
    planId: 'PRO_PLUS',
    limits: {
      workers: 8,
      sessions_per_day: -1,
      steps_per_session: 80,
      tokens_per_step_total: 10000,
      max_output_tokens: 700,
      tokens_per_day: 1000000,
      cooldown_between_steps_seconds: 0,
      priority_queue: true,
    },
    marketing_title: 'Pro Plus',
    marketing_bullets: ['Unlimited Scans'],
    marketing_footnote: MARKETING_FOOTNOTE,
    monthlyPriceUsd: 49,
  },
  ULTRA: {
    planId: 'ULTRA',
    limits: {
      workers: 20, // marketing: "Unlimited Workers"
      sessions_per_day: -1,
      steps_per_session: 500, // soft cap
      tokens_per_step_total: 14000,
      max_output_tokens: 1200,
      tokens_per_day: 5000000, // soft cap
      cooldown_between_steps_seconds: 0,
      throttle_on_soft_cap: true,
    },
    marketing_title: 'Ultra',
    marketing_bullets: ['Unlimited Workers', 'Unlimited Scans', 'Unlimited Steps'],
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
 * workers: "1" or "Unlimited*", scans: "5/day" or "Unlimited*", steps: "15/session" or "Unlimited*"
 */
export function getLimitsSummary(planId: PlanId): {
  workers: string;
  scans: string;
  steps: string;
} {
  const def = PLANS[planId] ?? PLANS.FREE;
  const { limits } = def;
  const unlimitedStar = 'Unlimited*';
  return {
    workers:
      limits.sessions_per_day === -1 && limits.workers >= 20
        ? unlimitedStar
        : String(limits.workers),
    scans:
      limits.sessions_per_day === -1
        ? unlimitedStar
        : `${limits.sessions_per_day}/day`,
    steps:
      limits.steps_per_session === -1
        ? unlimitedStar
        : `${limits.steps_per_session}/session`,
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
  limitsSummary: { workers: string; scans: string; steps: string };
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
            `${def.limits.workers} concurrent scan${def.limits.workers !== 1 ? 's' : ''}`,
            `${def.limits.sessions_per_day === -1 ? 'Unlimited' : def.limits.sessions_per_day} scans per day`,
            `${def.limits.steps_per_session === -1 ? 'Unlimited' : def.limits.steps_per_session} steps per session`,
          ],
      limitsSummary,
      popular: id === 'PRO_PLUS',
    };
  });
}
