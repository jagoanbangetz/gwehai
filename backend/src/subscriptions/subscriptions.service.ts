import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus, SubscriptionPlan } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
    private pointsService: PointsService,
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
}
