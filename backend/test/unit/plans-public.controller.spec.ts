import { PlansPublicController } from '../../src/plans/plans-public.controller';

describe('PlansPublicController', () => {
  let controller: PlansPublicController;

  beforeEach(() => {
    controller = new PlansPublicController();
  });

  it('returns tiers with workers/scans/steps for each plan', () => {
    const tiers = controller.getTiers();
    expect(tiers).toHaveLength(4);
    expect(tiers.map((t) => t.id)).toEqual(['FREE', 'PRO', 'PRO_PLUS', 'ULTRA']);
    for (const tier of tiers) {
      expect(tier.limitsSummary.workers).toBeDefined();
      expect(tier.limitsSummary.scans).toBeDefined();
      expect(tier.limitsSummary.steps).toBeDefined();
    }
    expect(tiers[0].limitsSummary.workers).toBe('1');
    expect(tiers[1].limitsSummary.workers).toBe('3');
    expect(tiers[2].limitsSummary.workers).toBe('8');
    expect(tiers[3].limitsSummary.workers).toBe('Unlimited*');
  });
});
