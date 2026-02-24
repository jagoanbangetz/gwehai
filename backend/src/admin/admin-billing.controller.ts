import { Controller, Get, Post, Body, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../entities/user.entity';
import { BillingSettingsService } from '../billing/billing-settings.service';
import { PaypalService, PlanPricingSchemeUpdate } from '../paypal/paypal.service';
import { AdminService } from './admin.service';
import { Request } from 'express';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBillingController {
  constructor(
    private readonly billingSettings: BillingSettingsService,
    private readonly paypalService: PaypalService,
    private readonly adminService: AdminService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  @Get('billing-settings')
  async getBillingSettings() {
    return this.billingSettings.getBillingSettings();
  }

  @Get('subscriptions')
  async listSubscriptions(): Promise<{
    subscriptions: Array<{
      id: string;
      userId: string;
      userEmail: string | null;
      plan: string;
      status: string;
      providerSubscriptionId: string | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      createdAt: string;
    }>;
  }> {
    const rows = await this.subscriptionRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const subscriptions = rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      userEmail: (s.user as { email?: string } | null)?.email ?? null,
      plan: s.plan,
      status: s.status,
      providerSubscriptionId: s.providerSubscriptionId ?? null,
      currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }));
    return { subscriptions };
  }

  @Post('billing-settings/update')
  async updateBillingSettings(
    @Body()
    body: {
      paypalEnabled?: boolean;
      paypalClientId?: string;
      paypalClientSecret?: string;
      paypalMode?: string;
      paypalPlanPro?: string;
      paypalPlanProPlus?: string;
      paypalPlanUltra?: string;
      priceMonthlyPRO?: number;
      priceMonthlyPRO_PLUS?: number;
      priceMonthlyULTRA?: number;
    },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    await this.billingSettings.updateBillingSettings(body);
    await this.adminService.log(adminUser.id, 'billing_settings_update', {
      resource: 'admin/billing-settings',
      details: JSON.stringify({ ...body, paypalClientSecret: body.paypalClientSecret ? '(set)' : undefined }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Post('billing-settings/create-paypal-plans')
  async createPaypalPlans(@Req() req: Request): Promise<{ planPro: string; planProPlus: string; planUltra: string }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException(
        'PayPal Client ID and Secret must be set and saved before creating plans.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const prices = await this.billingSettings.getPlanPrices();
    const result = await this.paypalService.createProductAndPlans(config, {
      PRO: prices.PRO,
      PRO_PLUS: prices.PRO_PLUS,
      ULTRA: prices.ULTRA,
    });
    if (!result) {
      throw new HttpException(
        'Failed to create plans in PayPal. Check credentials, mode (sandbox/live), and try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    await this.billingSettings.updateBillingSettings({
      paypalPlanPro: result.planPro,
      paypalPlanProPlus: result.planProPlus,
      paypalPlanUltra: result.planUltra,
    });
    await this.adminService.log(adminUser.id, 'billing_create_paypal_plans', {
      resource: 'admin/billing-settings',
      details: JSON.stringify({ planPro: result.planPro, planProPlus: result.planProPlus, planUltra: result.planUltra }),
      ipAddress: ip,
    });
    return result;
  }

  @Post('paypal/subscription/suspend')
  async suspendSubscription(
    @Body() body: { subscriptionId: string; reason?: string },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    if (!body?.subscriptionId?.trim()) {
      throw new HttpException('subscriptionId is required.', HttpStatus.BAD_REQUEST);
    }
    const ok = await this.paypalService.suspendSubscriptionWithConfig(
      config,
      body.subscriptionId.trim(),
      body.reason?.trim(),
    );
    if (!ok) {
      throw new HttpException('Failed to suspend subscription in PayPal.', HttpStatus.BAD_GATEWAY);
    }
    await this.adminService.log(adminUser.id, 'paypal_subscription_suspend', {
      resource: 'admin/paypal',
      details: JSON.stringify({ subscriptionId: body.subscriptionId }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Post('paypal/subscription/cancel')
  async cancelSubscription(
    @Body() body: { subscriptionId: string; reason?: string },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    if (!body?.subscriptionId?.trim()) {
      throw new HttpException('subscriptionId is required.', HttpStatus.BAD_REQUEST);
    }
    const subscriptionId = body.subscriptionId.trim();
    const ok = await this.paypalService.cancelSubscriptionWithConfig(
      config,
      subscriptionId,
      body.reason?.trim(),
    );
    if (!ok) {
      throw new HttpException('Failed to cancel subscription in PayPal.', HttpStatus.BAD_GATEWAY);
    }
    // Sync local subscription and user so status is CANCELLED (fixes approval_pending staying after cancel)
    await this.subscriptionsService.cancelFromPayPal(subscriptionId);
    await this.adminService.log(adminUser.id, 'paypal_subscription_cancel', {
      resource: 'admin/paypal',
      details: JSON.stringify({ subscriptionId }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Get('paypal/subscription/transactions')
  async listSubscriptionTransactions(
    @Req() req: Request,
    @Query('subscriptionId') subscriptionId: string,
    @Query('start_time') startTime?: string,
    @Query('end_time') endTime?: string,
  ): Promise<{ transactions: Array<Record<string, unknown>> }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    await this.adminService.log(adminUser.id, 'paypal_subscription_transactions', {
      resource: 'admin/paypal',
      details: JSON.stringify({ subscriptionId }),
      ipAddress: ip,
    });
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    if (!subscriptionId?.trim()) {
      throw new HttpException('subscriptionId query is required.', HttpStatus.BAD_REQUEST);
    }
    const result = await this.paypalService.listSubscriptionTransactionsWithConfig(
      config,
      subscriptionId.trim(),
      startTime?.trim(),
      endTime?.trim(),
    );
    if (result === null) {
      throw new HttpException('Failed to list subscription transactions from PayPal.', HttpStatus.BAD_GATEWAY);
    }
    return result;
  }

  @Post('paypal/plans/update-all-prices')
  async updateAllPlanPrices(
    @Body() body: { priceMonthlyPRO?: number; priceMonthlyPRO_PLUS?: number; priceMonthlyULTRA?: number },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    const savedPrices = await this.billingSettings.getPlanPrices();
    const PRO = body?.priceMonthlyPRO ?? savedPrices.PRO;
    const PRO_PLUS = body?.priceMonthlyPRO_PLUS ?? savedPrices.PRO_PLUS;
    const ULTRA = body?.priceMonthlyULTRA ?? savedPrices.ULTRA;
    const map = await this.billingSettings.getSettingsMap();
    const planPro = (map.get('paypalPlanPro') ?? '').trim();
    const planProPlus = (map.get('paypalPlanProPlus') ?? '').trim();
    const planUltra = (map.get('paypalPlanUltra') ?? '').trim();
    if (!planPro || !planProPlus || !planUltra) {
      throw new HttpException('All three plan IDs must be set before updating prices.', HttpStatus.BAD_REQUEST);
    }
    const pricingScheme = (_planId: string, value: number) => ({
      billing_cycle_sequence: 1,
      pricing_scheme: {
        fixed_price: { value: String(Math.max(0, value)), currency_code: 'USD' },
      },
    });
    const updates = [
      this.paypalService.updatePlanPricingWithConfig(config, planPro, [pricingScheme(planPro, PRO)]),
      this.paypalService.updatePlanPricingWithConfig(config, planProPlus, [pricingScheme(planProPlus, PRO_PLUS)]),
      this.paypalService.updatePlanPricingWithConfig(config, planUltra, [pricingScheme(planUltra, ULTRA)]),
    ];
    const results = await Promise.all(updates);
    if (results.some((ok) => !ok)) {
      throw new HttpException('One or more plan price updates failed in PayPal.', HttpStatus.BAD_GATEWAY);
    }
    await this.adminService.log(adminUser.id, 'paypal_plans_update_all_prices', {
      resource: 'admin/paypal',
      details: JSON.stringify({ PRO, PRO_PLUS: PRO_PLUS, ULTRA }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Post('paypal/plan/update-pricing')
  async updatePlanPricing(
    @Body()
    body: { planId: string; pricingSchemes: PlanPricingSchemeUpdate[] },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    if (!body?.planId?.trim() || !Array.isArray(body.pricingSchemes) || body.pricingSchemes.length === 0) {
      throw new HttpException('planId and pricingSchemes (non-empty array) are required.', HttpStatus.BAD_REQUEST);
    }
    const ok = await this.paypalService.updatePlanPricingWithConfig(
      config,
      body.planId.trim(),
      body.pricingSchemes,
    );
    if (!ok) {
      throw new HttpException('Failed to update plan pricing in PayPal.', HttpStatus.BAD_GATEWAY);
    }
    await this.adminService.log(adminUser.id, 'paypal_plan_update_pricing', {
      resource: 'admin/paypal',
      details: JSON.stringify({ planId: body.planId }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Post('paypal/plan/deactivate')
  async deactivatePlan(
    @Body() body: { planId: string },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    if (!body?.planId?.trim()) {
      throw new HttpException('planId is required.', HttpStatus.BAD_REQUEST);
    }
    const ok = await this.paypalService.deactivatePlanWithConfig(config, body.planId.trim());
    if (!ok) {
      throw new HttpException('Failed to deactivate plan in PayPal.', HttpStatus.BAD_GATEWAY);
    }
    await this.adminService.log(adminUser.id, 'paypal_plan_deactivate', {
      resource: 'admin/paypal',
      details: JSON.stringify({ planId: body.planId }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Post('paypal/plan/activate')
  async activatePlan(
    @Body() body: { planId: string },
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const config = await this.billingSettings.getPaypalConfig();
    if (!config?.clientId || !config?.clientSecret) {
      throw new HttpException('PayPal is not configured.', HttpStatus.BAD_REQUEST);
    }
    if (!body?.planId?.trim()) {
      throw new HttpException('planId is required.', HttpStatus.BAD_REQUEST);
    }
    const ok = await this.paypalService.activatePlanWithConfig(config, body.planId.trim());
    if (!ok) {
      throw new HttpException('Failed to activate plan in PayPal.', HttpStatus.BAD_GATEWAY);
    }
    await this.adminService.log(adminUser.id, 'paypal_plan_activate', {
      resource: 'admin/paypal',
      details: JSON.stringify({ planId: body.planId }),
      ipAddress: ip,
    });
    return { ok: true };
  }
}
