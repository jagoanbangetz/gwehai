import { PlansPublicController } from '../../src/plans/plans-public.controller';
import { BillingSettingsService } from '../../src/billing/billing-settings.service';
import { getPlanTiers } from '../../src/config/plans.config';

describe('PlansPublicController', () => {
  let controller: PlansPublicController;
  let billingSettings: BillingSettingsService;

  beforeEach(() => {
    billingSettings = {
      getPlanTiersWithPrices: jest.fn().mockResolvedValue(getPlanTiers()),
    } as unknown as BillingSettingsService;
    controller = new PlansPublicController(billingSettings);
  });

  it('returns tiers with workers/scans/steps/sub_agents for each plan', async () => {
    const tiers = await controller.getTiers();
    expect(tiers).toHaveLength(4);
    expect(tiers.map((t) => t.id)).toEqual(['FREE', 'PRO', 'PRO_PLUS', 'ULTRA']);
    for (const tier of tiers) {
      expect(tier.limitsSummary.workers).toBeDefined();
      expect(tier.limitsSummary.scans).toBeDefined();
      expect(tier.limitsSummary.steps).toBeDefined();
      expect(tier.limitsSummary.sub_agents).toBeDefined();
    }
    expect(tiers[0].limitsSummary.workers).toBe('1');
    expect(tiers[1].limitsSummary.workers).toBe('5');
    expect(tiers[2].limitsSummary.workers).toBe('10');
    expect(tiers[3].limitsSummary.workers).toBe('Unlimited*');
  });
});
