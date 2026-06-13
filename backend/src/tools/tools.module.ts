import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { ToolAvailabilityService } from './tool-availability.service';
import { JwtAnalyzerService } from './jwt-analyzer.service';
import { PayloadSandboxService } from './payload-sandbox.service';
import { GlobalMemoryService } from './global-memory.service';
import { WebSearchService } from './web-search.service';
import { OobDetectorModule } from './oob-detector.module';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { GlobalMemory } from '../entities/global-memory.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ConversationMemory, GlobalMemory]),
    AuthModule,
    OobDetectorModule,
  ],
  controllers: [ToolsController],
  providers: [ToolsService, ToolAvailabilityService, JwtAnalyzerService, PayloadSandboxService, GlobalMemoryService, WebSearchService],
  exports: [ToolsService, ToolAvailabilityService, JwtAnalyzerService, PayloadSandboxService, GlobalMemoryService, WebSearchService, OobDetectorModule],
})
export class ToolsModule {}
