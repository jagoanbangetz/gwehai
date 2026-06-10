import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingConfigController } from './admin-billing-config.controller';
import { AdminModelsController } from './admin-models.controller';
import { User } from '../entities/user.entity';
import { LlmModel } from '../entities/llm-model.entity';
import { BillingPolicy } from '../entities/billing-policy.entity';
import { PlanBillingRule } from '../entities/plan-billing-rule.entity';
import { Model } from '../entities/model.entity';
import { CreditOrder } from '../entities/credit-order.entity';
import { Report } from '../entities/report.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Message } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { MessageFile } from '../entities/message-file.entity';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Hacktivity } from '../entities/hacktivity.entity';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { AdminSetting } from '../entities/admin-setting.entity';
import { AbuseEvent } from '../entities/abuse-event.entity';
import { Subscription } from '../entities/subscription.entity';
import { GwehAIModule } from '../gwehai/gwehai.module';
import { PentestJobsModule } from '../pentest-jobs/pentest-jobs.module';
import { PlansModule } from '../plans/plans.module';
import { BillingModule } from '../billing/billing.module';
import { AdminService } from './admin.service';
import { AdminSettingsService } from './admin-settings.service';
import { HacktivityModule } from '../hacktivity/hacktivity.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { PaypalModule } from '../paypal/paypal.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { GwehAISSEGuard } from '../gwehai/gwehai-sse.guard';
import { CveFeedModule } from '../cve-feed/cve-feed.module';
import { AdminOpsController } from './admin-ops.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Model,
      LlmModel,
      BillingPolicy,
      PlanBillingRule,
      CreditOrder,
      Report,
      UsageEvent,
      Message,
      MessagePart,
      MessageFile,
      Conversation,
      ConversationMemory,
      Hacktivity,
      AdminAuditLog,
      AdminSetting,
      AbuseEvent,
      Subscription,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-super-secret-jwt-key',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    GwehAIModule,
    PentestJobsModule,
    PlansModule,
    HacktivityModule,
    MailModule,
    BillingModule,
    PaypalModule,
    SubscriptionsModule,
    CveFeedModule,
  ],
  controllers: [AdminController, AdminBillingController, AdminBillingConfigController, AdminModelsController, AdminOpsController],
  providers: [AdminService, AdminSettingsService, GwehAISSEGuard],
})
export class AdminModule {}

