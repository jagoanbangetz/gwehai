import {
  getPlanDefinition,
  getLimitsSummary,
  getPlanTiers,
  PLANS,
  type PlanId,
} from '../../src/config/plans.config';

describe('plans.config', () => {
  const PLAN_IDS: PlanId[] = ['FREE', 'PRO', 'PRO_PLUS', 'ULTRA'];

  describe('getPlanDefinition', () => {
    it('returns definition for each plan ID', () => {
      for (const id of PLAN_IDS) {
        const def = getPlanDefinition(id);
        expect(def).toBeDefined();
        expect(def.planId).toBe(id);
        expect(def.limits).toBeDefined();
        expect(def.limits.workers).toBeGreaterThanOrEqual(1);
        expect(def.limits.sessions_per_day).toBeDefined();
        expect(def.limits.steps_per_session).toBeDefined();
      }
    });

    it('returns FREE for unknown plan ID', () => {
      const def = getPlanDefinition('UNKNOWN' as PlanId);
      expect(def.planId).toBe('FREE');
    });

    it('has expected worker counts per plan', () => {
      expect(getPlanDefinition('FREE').limits.workers).toBe(1);
      expect(getPlanDefinition('PRO').limits.workers).toBe(3);
      expect(getPlanDefinition('PRO_PLUS').limits.workers).toBe(8);
      expect(getPlanDefinition('ULTRA').limits.workers).toBe(20);
    });

    it('has expected sessions_per_day (FREE limited, others unlimited)', () => {
      expect(getPlanDefinition('FREE').limits.sessions_per_day).toBe(5);
      expect(getPlanDefinition('PRO').limits.sessions_per_day).toBe(-1);
      expect(getPlanDefinition('PRO_PLUS').limits.sessions_per_day).toBe(-1);
      expect(getPlanDefinition('ULTRA').limits.sessions_per_day).toBe(-1);
    });

    it('has expected steps_per_session per plan', () => {
      expect(getPlanDefinition('FREE').limits.steps_per_session).toBe(15);
      expect(getPlanDefinition('PRO').limits.steps_per_session).toBe(40);
      expect(getPlanDefinition('PRO_PLUS').limits.steps_per_session).toBe(80);
      expect(getPlanDefinition('ULTRA').limits.steps_per_session).toBe(500);
    });
  });

  describe('getLimitsSummary', () => {
    it('returns workers/scans/steps strings for display', () => {
      const free = getLimitsSummary('FREE');
      expect(free.workers).toBe('1');
      expect(free.scans).toBe('5/day');
      expect(free.steps).toBe('15/session');

      const pro = getLimitsSummary('PRO');
      expect(pro.workers).toBe('3');
      expect(pro.scans).toBe('Unlimited*');
      expect(pro.steps).toBe('40/session');

      const proPlus = getLimitsSummary('PRO_PLUS');
      expect(proPlus.workers).toBe('8');
      expect(proPlus.scans).toBe('Unlimited*');
      expect(proPlus.steps).toBe('80/session');

      const ultra = getLimitsSummary('ULTRA');
      expect(ultra.workers).toBe('Unlimited*');
      expect(ultra.scans).toBe('Unlimited*');
      expect(ultra.steps).toBe('500/session'); // ULTRA has soft cap 500
    });

    it('returns same worker count as plan limits for non-ULTRA', () => {
      expect(getLimitsSummary('FREE').workers).toBe(String(PLANS.FREE.limits.workers));
      expect(getLimitsSummary('PRO').workers).toBe(String(PLANS.PRO.limits.workers));
      expect(getLimitsSummary('PRO_PLUS').workers).toBe(String(PLANS.PRO_PLUS.limits.workers));
    });
  });

  describe('getPlanTiers', () => {
    it('returns four tiers in order FREE, PRO, PRO_PLUS, ULTRA', () => {
      const tiers = getPlanTiers();
      expect(tiers).toHaveLength(4);
      expect(tiers.map((t) => t.id)).toEqual(['FREE', 'PRO', 'PRO_PLUS', 'ULTRA']);
    });

    it('each tier has limitsSummary matching getLimitsSummary', () => {
      const tiers = getPlanTiers();
      for (const tier of tiers) {
        const expected = getLimitsSummary(tier.id);
        expect(tier.limitsSummary.workers).toBe(expected.workers);
        expect(tier.limitsSummary.scans).toBe(expected.scans);
        expect(tier.limitsSummary.steps).toBe(expected.steps);
      }
    });

    it('worker counts are distinct and consistent across tiers', () => {
      const tiers = getPlanTiers();
      const workers = tiers.map((t) => t.limitsSummary.workers);
      expect(workers[0]).toBe('1');
      expect(workers[1]).toBe('3');
      expect(workers[2]).toBe('8');
      expect(workers[3]).toBe('Unlimited*'); // ULTRA: workers >= 20
    });

    it('each tier has name and priceMonthly', () => {
      const tiers = getPlanTiers();
      expect(tiers[0].name).toBe('Free');
      expect(tiers[0].priceMonthly).toBe(0);
      expect(tiers[1].priceMonthly).toBe(19);
      expect(tiers[2].priceMonthly).toBe(49);
      expect(tiers[3].priceMonthly).toBe(99);
    });
  });
});
