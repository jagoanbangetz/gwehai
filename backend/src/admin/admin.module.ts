import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { User } from '../entities/user.entity';
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
import { GwehAIModule } from '../gwehai/gwehai.module';
import { PlansModule } from '../plans/plans.module';
import { AdminService } from './admin.service';
import { HacktivityModule } from '../hacktivity/hacktivity.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { GwehAISSEGuard } from '../gwehai/gwehai-sse.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Model,
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
    PlansModule,
    HacktivityModule,
    MailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, GwehAISSEGuard],
})
export class AdminModule {}

