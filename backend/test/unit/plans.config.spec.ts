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
        expect(def.limits.max_sub_agents).toBeDefined();
      }
    });

    it('returns FREE for unknown plan ID', () => {
      const def = getPlanDefinition('UNKNOWN' as PlanId);
      expect(def.planId).toBe('FREE');
    });

    it('has expected worker counts per plan', () => {
      expect(getPlanDefinition('FREE').limits.workers).toBe(1);
      expect(getPlanDefinition('PRO').limits.workers).toBe(5);
      expect(getPlanDefinition('PRO_PLUS').limits.workers).toBe(10);
      expect(getPlanDefinition('ULTRA').limits.workers).toBe(50);
    });

    it('has expected sessions_per_day (FREE 3/day, others unlimited)', () => {
      expect(getPlanDefinition('FREE').limits.sessions_per_day).toBe(3);
      expect(getPlanDefinition('PRO').limits.sessions_per_day).toBe(-1);
      expect(getPlanDefinition('PRO_PLUS').limits.sessions_per_day).toBe(-1);
      expect(getPlanDefinition('ULTRA').limits.sessions_per_day).toBe(-1);
    });

    it('has unlimited steps_per_session for all plans', () => {
      expect(getPlanDefinition('FREE').limits.steps_per_session).toBe(-1);
      expect(getPlanDefinition('PRO').limits.steps_per_session).toBe(-1);
      expect(getPlanDefinition('PRO_PLUS').limits.steps_per_session).toBe(-1);
      expect(getPlanDefinition('ULTRA').limits.steps_per_session).toBe(-1);
    });

    it('has expected max_sub_agents per plan', () => {
      expect(getPlanDefinition('FREE').limits.max_sub_agents).toBe(0);
      expect(getPlanDefinition('PRO').limits.max_sub_agents).toBe(3);
      expect(getPlanDefinition('PRO_PLUS').limits.max_sub_agents).toBe(6);
      expect(getPlanDefinition('ULTRA').limits.max_sub_agents).toBe(-1);
    });
  });

  describe('getLimitsSummary', () => {
    it('returns workers/scans/steps/sub_agents strings for display', () => {
      const free = getLimitsSummary('FREE');
      expect(free.workers).toBe('1');
      expect(free.scans).toBe('3/day');
      expect(free.steps).toBe('Unlimited*');
      expect(free.sub_agents).toBe('0');

      const pro = getLimitsSummary('PRO');
      expect(pro.workers).toBe('5');
      expect(pro.scans).toBe('Unlimited*');
      expect(pro.steps).toBe('Unlimited*');
      expect(pro.sub_agents).toBe('3');

      const proPlus = getLimitsSummary('PRO_PLUS');
      expect(proPlus.workers).toBe('10');
      expect(proPlus.scans).toBe('Unlimited*');
      expect(proPlus.steps).toBe('Unlimited*');
      expect(proPlus.sub_agents).toBe('6');

      const ultra = getLimitsSummary('ULTRA');
      expect(ultra.workers).toBe('Unlimited*');
      expect(ultra.scans).toBe('Unlimited*');
      expect(ultra.steps).toBe('Unlimited*');
      expect(ultra.sub_agents).toBe('Unlimited*');
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
        expect(tier.limitsSummary.sub_agents).toBe(expected.sub_agents);
      }
    });

    it('worker counts are distinct and consistent across tiers', () => {
      const tiers = getPlanTiers();
      const workers = tiers.map((t) => t.limitsSummary.workers);
      expect(workers[0]).toBe('1');
      expect(workers[1]).toBe('5');
      expect(workers[2]).toBe('10');
      expect(workers[3]).toBe('Unlimited*');
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
