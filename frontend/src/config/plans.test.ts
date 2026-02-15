import { describe, it, expect } from 'vitest'
import {
  PLAN_TIERS,
  getPlanTier,
  formatWorkersLabel,
  type PlanId,
} from './plans'

describe('plans config', () => {
  const PLAN_IDS: PlanId[] = ['FREE', 'PRO', 'PRO_PLUS', 'ULTRA']

  describe('PLAN_TIERS', () => {
    it('has four tiers in order FREE, PRO, PRO_PLUS, ULTRA', () => {
      expect(PLAN_TIERS).toHaveLength(4)
      expect(PLAN_TIERS.map((t) => t.id)).toEqual(PLAN_IDS)
    })

    it('each tier has limitsSummary with workers, scans, steps', () => {
      for (const tier of PLAN_TIERS) {
        expect(tier.limitsSummary).toBeDefined()
        expect(typeof tier.limitsSummary.workers).toBe('string')
        expect(typeof tier.limitsSummary.scans).toBe('string')
        expect(typeof tier.limitsSummary.steps).toBe('string')
      }
    })

    it('worker counts are distinct so users can compare plans', () => {
      const workers = PLAN_TIERS.map((t) => t.limitsSummary.workers)
      expect(workers[0]).toBe('1')
      expect(workers[1]).toBe('3')
      expect(workers[2]).toBe('8')
      expect(workers[3]).toBe('Unlimited*')
    })

    it('FREE has 5/day scans and 15/session steps', () => {
      const free = PLAN_TIERS.find((t) => t.id === 'FREE')!
      expect(free.limitsSummary.scans).toBe('5/day')
      expect(free.limitsSummary.steps).toBe('15/session')
    })

    it('PRO and PRO_PLUS have Unlimited* scans', () => {
      expect(PLAN_TIERS.find((t) => t.id === 'PRO')!.limitsSummary.scans).toBe('Unlimited*')
      expect(PLAN_TIERS.find((t) => t.id === 'PRO_PLUS')!.limitsSummary.scans).toBe('Unlimited*')
    })

    it('each tier has name and priceMonthly', () => {
      expect(PLAN_TIERS[0].name).toBe('Free')
      expect(PLAN_TIERS[0].priceMonthly).toBe(0)
      expect(PLAN_TIERS[1].priceMonthly).toBe(19)
      expect(PLAN_TIERS[2].priceMonthly).toBe(49)
      expect(PLAN_TIERS[3].priceMonthly).toBe(99)
    })
  })

  describe('getPlanTier', () => {
    it('returns tier for each plan ID', () => {
      for (const id of PLAN_IDS) {
        const tier = getPlanTier(id)
        expect(tier).toBeDefined()
        expect(tier!.id).toBe(id)
      }
    })
    it('returns undefined for unknown id', () => {
      expect(getPlanTier('UNKNOWN' as PlanId)).toBeUndefined()
    })
  })

  describe('formatWorkersLabel', () => {
    it('formats "1" as "1 worker"', () => {
      expect(formatWorkersLabel('1')).toBe('1 worker')
    })
    it('formats "3" and "8" as "X workers"', () => {
      expect(formatWorkersLabel('3')).toBe('3 workers')
      expect(formatWorkersLabel('8')).toBe('8 workers')
    })
    it('returns "Unlimited*" as-is', () => {
      expect(formatWorkersLabel('Unlimited*')).toBe('Unlimited*')
    })
  })
})
