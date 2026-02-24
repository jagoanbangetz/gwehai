import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { PaypalWebhookController } from './paypal-webhook.controller';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { PointsModule } from '../points/points.module';
import { PaypalModule } from '../paypal/paypal.module';
import { PlansModule } from '../plans/plans.module';
import { BillingModule } from '../billing/billing.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, User]),
    BillingModule,
    MailModule,
    PointsModule,
    PaypalModule,
    PlansModule,
  ],
  controllers: [SubscriptionsController, PaypalWebhookController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
