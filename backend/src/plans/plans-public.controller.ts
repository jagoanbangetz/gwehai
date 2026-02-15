import { Controller, Get } from '@nestjs/common';
import { getPlanTiers } from '../config/plans.config';

/**
 * Public plan endpoints (no auth). Used by Pricing page and upgrade modals
 * so workers/scans/steps are the same as backend enforcement.
 */
@Controller('plans')
export class PlansPublicController {
  /**
   * Returns config-based tiers (workers, scans, steps) for display.
   * Adjust limits in plans.config.ts; validation uses the same config.
   */
  @Get('tiers')
  getTiers() {
    return getPlanTiers();
  }
}
