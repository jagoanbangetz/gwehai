import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Message, MessageRole } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { PointsModule } from '../points/points.module';
import { LlmModule } from '../llm/llm.module';
import { ToolsModule } from '../tools/tools.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationMemory, Message, MessagePart, Model, UsageEvent]),
    PointsModule,
    LlmModule,
    ToolsModule,
    ReportsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
