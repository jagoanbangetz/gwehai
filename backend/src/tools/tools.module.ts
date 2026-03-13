import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { PayloadSandboxService } from './payload-sandbox.service';
import { ConversationMemory } from '../entities/conversation-memory.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ConversationMemory]),
    AuthModule,
  ],
  controllers: [ToolsController],
  providers: [ToolsService, PayloadSandboxService],
  exports: [ToolsService, PayloadSandboxService],
})
export class ToolsModule {}
