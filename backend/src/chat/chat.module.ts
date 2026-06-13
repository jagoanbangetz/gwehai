import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Message, MessageRole } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { ConversationJob } from '../entities/conversation-job.entity';
import { ConversationEvent } from '../entities/conversation-event.entity';
import { PointsModule } from '../points/points.module';
import { LlmModule } from '../llm/llm.module';
import { ToolsModule } from '../tools/tools.module';
import { ReportsModule } from '../reports/reports.module';
import { HacktivityModule } from '../hacktivity/hacktivity.module';
import { PlansModule } from '../plans/plans.module';
import { PentestJobsModule } from '../pentest-jobs/pentest-jobs.module';
import { BillingModule } from '../billing/billing.module';
import { AttackChainModule } from '../attack-chain/attack-chain.module';
import { BrowserAgentModule } from '../browser-agent/browser-agent.module';
import { ResearchBrowserModule } from '../research-browser/research-browser.module';
import { CveFeedModule } from '../cve-feed/cve-feed.module';
import { PromptModule } from '../prompt/prompt.module';
import { OobDetectorModule } from '../tools/oob-detector.module';
import { ConversationService } from './conversation.service';
import { CostService } from './cost.service';
import { ToolExecutorService } from './tool-executor.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { ConversationJobService } from './conversation-job.service';
import { ConversationJobController, EventLogController } from './conversation-job.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationMemory, Message, MessagePart, Model, UsageEvent, ConversationJob, ConversationEvent]),
    PointsModule,
    BillingModule,
    LlmModule,
    ToolsModule,
    ReportsModule,
    HacktivityModule,
    PlansModule,
    forwardRef(() => PentestJobsModule),
    AttackChainModule,
    BrowserAgentModule,
    ResearchBrowserModule,
    CveFeedModule,
    PromptModule,
    OobDetectorModule,
  ],
  controllers: [ChatController, ConversationJobController, EventLogController],
  providers: [
    ConversationService,
    CostService,
    ToolExecutorService,
    AgentOrchestratorService,
    ChatService,
    ConversationJobService,
  ],
  exports: [ChatService, ConversationService, AgentOrchestratorService, ConversationJobService],
})
export class ChatModule {}
