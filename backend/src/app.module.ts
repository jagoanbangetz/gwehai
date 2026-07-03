import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { AuthModule } from './auth/auth.module';
import { PointsModule } from './points/points.module';
import { PaymentsModule } from './payments/payments.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { getDatabaseConfig } from './config/database.config';
import { User } from './entities/user.entity';
import { Model } from './entities/model.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessagePart } from './entities/message-part.entity';
import { File } from './entities/file.entity';
import { MessageFile } from './entities/message-file.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { CreditPack } from './entities/credit-pack.entity';
import { CreditOrder } from './entities/credit-order.entity';
import { PointLedger } from './entities/point-ledger.entity';
import { UserPointBalance } from './entities/user-point-balance.entity';
import { Subscription } from './entities/subscription.entity';
import { Report } from './entities/report.entity';
import { Plan } from './entities/plan.entity';
import { UserPlan } from './entities/user-plan.entity';
import { PlanUsageDaily } from './entities/plan-usage-daily.entity';
import { ConversationMemory } from './entities/conversation-memory.entity';
import { Hacktivity } from './entities/hacktivity.entity';
import { GlobalMemory } from './entities/global-memory.entity';
import { AdminModule } from './admin/admin.module';
import { HacktivityModule } from './hacktivity/hacktivity.module';
import { ReportsModule } from './reports/reports.module';
import { PlansModule } from './plans/plans.module';
import { GwehAIModule } from './gwehai/gwehai.module';
import { ToolsModule } from './tools/tools.module';
import { PentestJobsModule } from './pentest-jobs/pentest-jobs.module';
import { MailModule } from './mail/mail.module';
import { CveFeedModule } from './cve-feed/cve-feed.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { WebhookModule } from './webhooks/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      User,
      Model,
      Conversation,
      Message,
      MessagePart,
      File,
      MessageFile,
      UsageEvent,
      CreditPack,
      CreditOrder,
      PointLedger,
      UserPointBalance,
      Subscription,
      Report,
      Plan,
      UserPlan,
      PlanUsageDaily,
      ConversationMemory,
      Hacktivity,
      GlobalMemory,
    ]),
    MailModule,
    ChatModule,
    CveFeedModule,
    AuthModule,
    PointsModule,
    PaymentsModule,
    SubscriptionsModule,
    ReportsModule,
    PlansModule,
    AdminModule,
    GwehAIModule,
    ToolsModule,
    PentestJobsModule,
    HacktivityModule,
    HealthModule,
    StorageModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
