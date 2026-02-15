/**
 * Plan tiers and prices for display (Pricing page, Dashboard upgrade modal).
 * Keep in sync with backend plan IDs: FREE, PRO, PRO_PLUS, ULTRA.
 */

export type PlanId = 'FREE' | 'PRO' | 'PRO_PLUS' | 'ULTRA'

export const PLAN_FOOTNOTE = '*Fair usage policy applies'

export interface PlanTier {
  id: PlanId
  name: string
  /** Monthly price in USD; 0 = Free */
  priceMonthly: number
  /** Marketing bullets (e.g. "Unlimited Scans") */
  features: string[]
  /** Limits summary for display */
  limitsSummary: {
    workers: string
    scans: string
    steps: string
  }
  popular?: boolean
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    features: ['1 concurrent scan', '5 scans per day', '15 steps per session'],
    limitsSummary: { workers: '1', scans: '5/day', steps: '15/session' },
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceMonthly: 19,
    features: ['Unlimited Scans', '3 concurrent workers', '40 steps per session'],
    limitsSummary: { workers: '3', scans: 'Unlimited*', steps: '40/session' },
  },
  {
    id: 'PRO_PLUS',
    name: 'Pro Plus',
    priceMonthly: 49,
    features: ['Unlimited Scans', '8 concurrent workers', '80 steps per session', 'Priority queue'],
    limitsSummary: { workers: '8', scans: 'Unlimited*', steps: '80/session' },
    popular: true,
  },
  {
    id: 'ULTRA',
    name: 'Ultra',
    priceMonthly: 99,
    features: ['Unlimited Workers', 'Unlimited Scans', 'Unlimited Steps'],
    limitsSummary: { workers: 'Unlimited*', scans: 'Unlimited*', steps: 'Unlimited*' },
  },
]

export function getPlanTier(id: PlanId): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.id === id)
}

/**
 * Format workers count for display so users can compare plans consistently.
 * "1" → "1 worker", "3" → "3 workers", "Unlimited*" → "Unlimited*"
 */
export function formatWorkersLabel(workers: string): string {
  if (workers === 'Unlimited*' || workers === '1') return workers === '1' ? '1 worker' : workers
  return `${workers} workers`
}
