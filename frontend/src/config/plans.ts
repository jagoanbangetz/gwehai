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
    sub_agents: string
  }
  popular?: boolean
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    features: ['Unlimited steps per scan', '1 target at a time', '3 targets per day', 'No sub-agents'],
    limitsSummary: { workers: '1', scans: '3/day', steps: 'Unlimited*', sub_agents: '0' },
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceMonthly: 19,
    features: ['Unlimited steps', '5 concurrent targets', 'Spawn up to 3 sub-agents'],
    limitsSummary: { workers: '5', scans: 'Unlimited*', steps: 'Unlimited*', sub_agents: '3' },
  },
  {
    id: 'PRO_PLUS',
    name: 'Pro Plus',
    priceMonthly: 49,
    features: ['Unlimited steps', '10 concurrent targets', 'Spawn up to 6 sub-agents', 'Priority queue'],
    limitsSummary: { workers: '10', scans: 'Unlimited*', steps: 'Unlimited*', sub_agents: '6' },
    popular: true,
  },
  {
    id: 'ULTRA',
    name: 'Ultra',
    priceMonthly: 99,
    features: ['Unlimited steps', 'Unlimited concurrent targets', 'Unlimited sub-agents'],
    limitsSummary: { workers: 'Unlimited*', scans: 'Unlimited*', steps: 'Unlimited*', sub_agents: 'Unlimited*' },
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
