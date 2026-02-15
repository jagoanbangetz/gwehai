import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { GwehAIModule } from '../gwehai/gwehai.module';
import { AdminService } from './admin.service';

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
    ]),
    GwehAIModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

