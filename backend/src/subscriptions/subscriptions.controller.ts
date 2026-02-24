import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { PlanResolutionService } from '../plans/plan-resolution.service';
import { PlanId } from '../config/plans.config';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly planResolution: PlanResolutionService,
  ) {}

  /**
   * Create a PayPal subscription for the given plan. Returns approval URL to redirect the user.
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  async create(
    @Req() req: Request,
    @Body() body: { planId: PlanId; returnUrl: string; cancelUrl: string },
  ) {
    const user = (req as any).user;
    const { planId, returnUrl, cancelUrl } = body;
    if (!planId || planId === 'FREE') {
      return { ok: false, message: 'Invalid plan' };
    }
    if (!returnUrl || !cancelUrl) {
      return { ok: false, message: 'returnUrl and cancelUrl are required' };
    }
    if (!(await this.subscriptions.isPayPalEnabled())) {
      return { ok: false, message: 'PayPal subscriptions are not configured' };
    }
    const result = await this.subscriptions.createPayPalSubscription(
      user.id,
      planId,
      returnUrl,
      cancelUrl,
    );
    if (!result) {
      return { ok: false, message: 'Failed to create subscription or plan not configured' };
    }
    return {
      ok: true,
      approvalUrl: result.approvalUrl,
      subscriptionId: result.subscriptionId,
    };
  }

  /**
   * Complete subscription after user returns from PayPal approval.
   * Call this when landing on returnUrl with subscription_id (or token) in query.
   * Upgrades the user's plan immediately without relying on webhook.
   */
  @Post('complete')
  @UseGuards(JwtAuthGuard)
  async complete(
    @Req() req: Request,
    @Body() body: { subscription_id?: string; token?: string },
  ) {
    const user = (req as any).user;
    const subscriptionId = (body?.subscription_id ?? body?.token ?? '').trim();
    if (!subscriptionId) {
      return { ok: false, message: 'subscription_id or token is required' };
    }
    const result = await this.subscriptions.completeSubscription(subscriptionId, user.id);
    if (!result) {
      return { ok: false, message: 'Subscription not found or already completed' };
    }
    return { ok: true };
  }

  /**
   * Get current user's subscription (PayPal or internal).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    const user = (req as any).user;
    const sub = await this.subscriptions.getUserSubscription(user.id);
    const planId = await this.planResolution.getUserPlan(user.id);
    return {
      subscription: sub
        ? {
            id: sub.id,
            planId: sub.planId ?? sub.plan,
            status: sub.status,
            providerSubscriptionId: sub.providerSubscriptionId,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      planId,
      paypalEnabled: await this.subscriptions.isPayPalEnabled(),
    };
  }
}
