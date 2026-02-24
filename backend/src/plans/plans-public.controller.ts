import { Controller, Get } from '@nestjs/common';
import { BillingSettingsService } from '../billing/billing-settings.service';

/**
 * Public plan endpoints (no auth). Used by Pricing page and upgrade modals
 * so workers/scans/steps are the same as backend enforcement.
 */
@Controller('plans')
export class PlansPublicController {
  constructor(private readonly billingSettings: BillingSettingsService) {}

  /**
   * Returns tiers with admin-overridable prices (workers, scans, steps from config).
   */
  @Get('tiers')
  async getTiers() {
    return this.billingSettings.getPlanTiersWithPrices();
  }
}
