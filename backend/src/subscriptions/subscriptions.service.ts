import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus, SubscriptionPlan } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import { PaypalService } from '../paypal/paypal.service';
import { BillingSettingsService } from '../billing/billing-settings.service';
import { MailService } from '../mail/mail.service';
import { PlanId } from '../config/plans.config';

function planIdToDisplayName(planId: string): string {
  const map: Record<string, string> = {
    PRO: 'Pro',
    PRO_PLUS: 'Pro Plus',
    ULTRA: 'Ultra',
  };
  return map[planId?.toUpperCase() ?? ''] ?? planId ?? 'Pro';
}

const PLAN_TO_SUBSCRIPTION_PLAN: Record<string, SubscriptionPlan> = {
  PRO: SubscriptionPlan.PRO,
  PRO_PLUS: SubscriptionPlan.PRO_PLUS,
  ULTRA: SubscriptionPlan.ULTRA,
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private pointsService: PointsService,
    private paypalService: PaypalService,
    private billingSettings: BillingSettingsService,
    private mailService: MailService,
  ) {}

  /**
   * Get or create subscription for user
   */
  async getOrCreateSubscription(
    userId: string,
    plan: SubscriptionPlan,
    monthlyPointsGrant: number,
  ): Promise<Subscription> {
    let subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (subscription) {
      return subscription;
    }

    subscription = this.subscriptionRepo.create({
      userId,
      plan,
      monthlyPointsGrant,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return await this.subscriptionRepo.save(subscription);
  }

  /**
   * Process subscription renewal (grant monthly points)
   */
  async processRenewal(subscriptionId: string): Promise<void> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
      return;
    }

    if (subscription.monthlyPointsGrant > 0) {
      await this.pointsService.grantPoints(
        subscription.userId,
        subscription.monthlyPointsGrant,
        PointLedgerReason.SUBSCRIPTION_RENEWAL,
        'subscriptions',
        subscription.id,
        { plan: subscription.plan },
      );
    }

    // Update period dates
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    );
    await this.subscriptionRepo.save(subscription);
  }

  /**
   * Get user's active subscription
   */
  async getUserSubscription(userId: string): Promise<Subscription | null> {
    return await this.subscriptionRepo.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });
  }

  /**
   * Create PayPal subscription and local record. Returns approval URL for frontend redirect.
   * Uses admin billing config when present, otherwise env.
   */
  async createPayPalSubscription(
    userId: string,
    planId: PlanId,
    returnUrl: string,
    cancelUrl: string,
  ): Promise<{ approvalUrl: string; subscriptionId: string } | null> {
    const billingConfig = await this.billingSettings.getPaypalConfig();
    const useBilling = !!billingConfig?.clientId && !!billingConfig?.clientSecret;
    if (!useBilling && !this.paypalService.isConfigured()) return null;
    if (planId === 'FREE') return null;

    const params = { planId, userId, returnUrl, cancelUrl };
    const result = useBilling && billingConfig
      ? await this.paypalService.createSubscriptionWithConfig(params, billingConfig)
      : await this.paypalService.createSubscription(params);
    if (!result?.approvalUrl) return null;

    const planEnum = PLAN_TO_SUBSCRIPTION_PLAN[planId] ?? SubscriptionPlan.PRO;
    await this.subscriptionRepo.save(
      this.subscriptionRepo.create({
        userId,
        plan: planEnum,
        planId,
        status: SubscriptionStatus.APPROVAL_PENDING,
        providerSubscriptionId: result.subscriptionId,
        monthlyPointsGrant: 0,
      }),
    );
    return { approvalUrl: result.approvalUrl, subscriptionId: result.subscriptionId };
  }

  /**
   * Complete subscription after user returns from PayPal approval (return URL flow).
   * Only the subscription owner can complete. Returns true if completed, false if not found or already active.
   */
  async completeSubscription(paypalSubscriptionId: string, userId: string): Promise<boolean> {
    const sub = await this.subscriptionRepo.findOne({
      where: {
        providerSubscriptionId: paypalSubscriptionId,
        userId,
      },
    });
    if (!sub || sub.status !== SubscriptionStatus.APPROVAL_PENDING) return false;
    await this.activateFromPayPal(paypalSubscriptionId);
    return true;
  }

  /**
   * Activate subscription when PayPal webhook fires BILLING.SUBSCRIPTION.ACTIVATED.
   * Sets user.planId and updates subscription status.
   */
  async activateFromPayPal(paypalSubscriptionId: string): Promise<void> {
    const sub = await this.subscriptionRepo.findOne({
      where: { providerSubscriptionId: paypalSubscriptionId },
    });
    if (!sub) return;
    const planId = (sub.planId?.toUpperCase() || 'PRO') as PlanId;
    if (planId !== 'FREE' && ['PRO', 'PRO_PLUS', 'ULTRA'].includes(planId)) {
      await this.userRepo.update(sub.userId, { planId });
    }
    sub.status = SubscriptionStatus.ACTIVE;
    sub.currentPeriodStart = new Date();
    sub.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.subscriptionRepo.save(sub);

    // Notify user by email when subscription is active (fire-and-forget; don't block on mail)
    if (this.mailService.isConfigured()) {
      const user = await this.userRepo.findOne({ where: { id: sub.userId } });
      if (user?.email) {
        const planName = planIdToDisplayName(planId);
        this.mailService.sendSubscriptionSuccess(user.email, planName).catch(() => {});
      }
    }
  }

  /**
   * Handle cancellation/suspension from PayPal. Reset user to FREE.
   */
  async cancelFromPayPal(paypalSubscriptionId: string): Promise<void> {
    const sub = await this.subscriptionRepo.findOne({
      where: { providerSubscriptionId: paypalSubscriptionId },
    });
    if (!sub) return;
    sub.status = SubscriptionStatus.CANCELLED;
    sub.cancelledAt = new Date();
    await this.subscriptionRepo.save(sub);
    await this.userRepo.update(sub.userId, { planId: 'FREE' });
  }

  /**
   * Find subscription by PayPal subscription ID.
   */
  async findByProviderId(providerSubscriptionId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({
      where: { providerSubscriptionId },
    });
  }

  async isPayPalEnabled(): Promise<boolean> {
    const fromBilling = await this.billingSettings.isPaypalConfigured();
    return fromBilling || this.paypalService.isConfigured();
  }

  /**
   * Cancel the current user's subscription (PayPal + local). User must own an active subscription with a provider ID.
   */
  async cancelMySubscription(userId: string): Promise<{ ok: boolean; message?: string }> {
    const sub = await this.subscriptionRepo.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });
    if (!sub || !sub.providerSubscriptionId) {
      return { ok: false, message: 'No active subscription to cancel' };
    }
    const config = await this.billingSettings.getPaypalConfig();
    let ok: boolean;
    if (config) {
      ok = await this.paypalService.cancelSubscriptionWithConfig(
        config,
        sub.providerSubscriptionId,
        'User requested cancellation',
      );
    } else {
      ok = await this.paypalService.cancelSubscription(
        sub.providerSubscriptionId,
        'User requested cancellation',
      );
    }
    if (!ok) {
      return { ok: false, message: 'Failed to cancel subscription in PayPal' };
    }
    await this.cancelFromPayPal(sub.providerSubscriptionId);
    return { ok: true };
  }
}
