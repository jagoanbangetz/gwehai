/**
 * ChatService — Facade
 * 
 * Slim facade that delegates to specialized sub-services:
 * - ConversationService: conversation/message persistence
 * - CostService: billing & points
 * - ToolExecutorService: tool execution dispatch
 * - AgentOrchestratorService: agent loop & SSE streaming
 * 
 * Public API is preserved for backward compatibility with controllers and other modules.
 */

import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull, EntityManager } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Message, MessageRole } from '../entities/message.entity';
import { MessagePartType } from '../entities/message-part.entity';
import { MessagePart } from '../entities/message-part.entity';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import { LlmService } from '../llm/llm.service';
import { ProviderRouterService, normalizeLlmErrorMessage } from '../llm/provider-router.service';
import { CostManagerService } from '../llm/cost-manager.service';
import type { ModelOptionKey } from '../config/model-options.config';
import { isChatCapableModelKey } from '../config/model-options.config';
import { PENTEST_SYSTEM_PROMPT, SIMPLE_SECURITY_SYSTEM_PROMPT } from '../prompt/pentest.system-prompt';
import { GWEHAI_CONVERSATION_SYSTEM_PROMPT } from '../prompt/gwehai-identity';
import { PENTEST_TOOL_DEFS } from '../prompt/pentest-tools.def';
import { LlmMessage, LlmToolCall } from '../llm/llm.types';
import { ToolsService } from '../tools/tools.service';
import { ReportsService } from '../reports/reports.service';
import { HacktivityService } from '../hacktivity/hacktivity.service';
import { getAgentLabel } from './agent-names';
import { PlanResolutionService } from '../plans/plan-resolution.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { PolicyOverridesService } from '../plans/policy-overrides.service';
import { validateStep } from '../plans/plan-limits.validation';
import { getPlanPayload } from '../config/plans.config';
import { PentestJobsService } from '../pentest-jobs/pentest-jobs.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { CostCalculatorService } from '../billing/cost-calculator.service';
import { POINTS_ENABLED } from '../config/plan-billing.config';
import { ConversationService } from './conversation.service';
import { CostService } from './cost.service';
import { ToolExecutorService, ALLOWED_AGENT_ROLES } from './tool-executor.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';

@Injectable()
export class ChatService {
  constructor(
    // Legacy direct deps — kept for backward compat with existing callers
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMemory)
    private memoryRepo: Repository<ConversationMemory>,
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    @InjectRepository(MessagePart)
    private messagePartRepo: Repository<MessagePart>,
    @InjectRepository(Model)
    private modelRepo: Repository<Model>,
    @InjectRepository(UsageEvent)
    private usageEventRepo: Repository<UsageEvent>,
    private pointsService: PointsService,
    private llmService: LlmService,
    private toolsService: ToolsService,
    private reportsService: ReportsService,
    private hacktivityService: HacktivityService,
    private planResolution: PlanResolutionService,
    private planUsage: PlanUsageService,
    private policyOverrides: PolicyOverridesService,
    @Inject(forwardRef(() => PentestJobsService))
    private pentestJobs: PentestJobsService,
    private providerRouter: ProviderRouterService,
    private costManager: CostManagerService,
    private dataSource: DataSource,
    // New sub-services (before optional params to satisfy TS)
    private conversationService: ConversationService,
    private costService: CostService,
    private toolExecutor: ToolExecutorService,
    private agentOrchestrator: AgentOrchestratorService,
    @Optional() private billingConfig?: BillingConfigService,
    @Optional() private costCalculator?: CostCalculatorService,
  ) {}

  /** Allowed agent roles for sessions_spawn (multi-agent collaboration). */
  static readonly ALLOWED_AGENT_ROLES = ALLOWED_AGENT_ROLES;

  // ─── Delegated: Conversation CRUD ──────────────────────────────────────

  async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    modelId?: string,
    skipDefaultModel?: boolean,
  ): Promise<Conversation> {
    return this.conversationService.getOrCreateConversation(userId, conversationId, modelId, skipDefaultModel);
  }

  async createConversationWithSeed(
    userId: string,
    title: string,
    seedMessage: string,
    modelId?: string,
    pentestJobId?: string,
  ): Promise<Conversation> {
    return this.conversationService.createConversationWithSeed(userId, title, seedMessage, modelId, pentestJobId);
  }

  async setConversationRunStatus(conversationId: string | undefined, status: 'running' | 'finished' | 'error' | 'stopped'): Promise<void> {
    return this.conversationService.setConversationRunStatus(conversationId, status);
  }

  async getUserConversations(userId: string, includeMessages: boolean = false): Promise<Conversation[]> {
    return this.conversationService.getUserConversations(userId, includeMessages);
  }

  async getConversation(userId: string, conversationId: string): Promise<Conversation & { memory?: Array<{ path: string; content: string }> }> {
    return this.conversationService.getConversation(userId, conversationId);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    return this.conversationService.deleteConversation(userId, conversationId);
  }

  async getModels(): Promise<Model[]> {
    return this.conversationService.getModels();
  }

  // ─── Delegated: Sessions ───────────────────────────────────────────────

  async listSessions(userId: string, filters?: { parent_id?: string; role?: string; last?: number }) {
    return this.conversationService.listSessions(userId, filters);
  }

  async getSessionHistory(userId: string, conversationId: string, last: number = 50) {
    return this.conversationService.getSessionHistory(userId, conversationId, last);
  }

  async spawnSession(userId: string, parentConversationId: string, role?: string, title?: string) {
    return this.conversationService.spawnSession(userId, parentConversationId, role, title, ALLOWED_AGENT_ROLES);
  }

  async getSessionStatus(userId: string, conversationId: string) {
    return this.conversationService.getSessionStatus(userId, conversationId);
  }

  // ─── Delegated: Message Processing ─────────────────────────────────────

  /**
   * Process message with points deduction (ACID-safe).
   */
  async processMessage(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    const useDynamicBilling = await this.costService.isDynamicBillingAvailable();

    if (useDynamicBilling) {
      return this.processMessageWithDynamicBilling(userId, message, conversationId, modelId);
    }
    return this.processMessageLegacy(userId, message, conversationId, modelId);
  }

  private async processMessageWithDynamicBilling(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    const billingConfig = this.costService.billingConfigService!;
    const costCalculator = this.costService.costCalculatorService!;
    const snapshot = await billingConfig.getSnapshot();
    const planId = await this.planResolution.getUserPlan(userId);
    const modelKey = await billingConfig.resolveModelForPlan(planId, null);
    const estimatedOutput = costCalculator.estimateOutputTokensForReserve(undefined);
    const inputTokensEst = Math.ceil(message.length / 4);
    const reserveResult = costCalculator.computeCredits(snapshot, {
      planId, opType: 'chat_turn', modelKey, inputTokens: inputTokensEst, outputTokens: estimatedOutput,
    });
    const reservedCredits = reserveResult.credits;

    const { conversation, model, assistantMessage } = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.conversationService.getOrCreateConversation(userId, conversationId, modelId);
      const model = await manager.findOne(Model, { where: { id: conversation.modelId || modelId } });
      if (!model || !model.isActive) {
        throw new NotFoundException('Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.');
      }
      const userMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.USER, content: message });
      await manager.save(userMessage);
      await manager.save(manager.create(MessagePart, { messageId: userMessage.id, type: 'text' as any, content: message, order: 0 }));
      const assistantMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: '' });
      await manager.save(assistantMessage);
      await manager.save(manager.create(MessagePart, { messageId: assistantMessage.id, type: 'text' as any, content: '', order: 0 }));
      return { conversation, model, assistantMessage };
    });

    await this.costService.reserveCredits(userId, reservedCredits, assistantMessage.id);

    const aiResult = await this.generateResponse(message, model);
    const response = aiResult.content;
    const responseOutputTokens = aiResult.usage?.outputTokens ?? Math.ceil(response.length / 4);
    const responseInputTokens = aiResult.usage?.inputTokens ?? inputTokensEst;

    const actualResult = costCalculator.computeCredits(snapshot, {
      planId, opType: 'chat_turn', modelKey, inputTokens: responseInputTokens, outputTokens: responseOutputTokens,
    });
    const actualCredits = actualResult.credits;

    await this.costService.settleCredits(userId, assistantMessage.id, reservedCredits, actualCredits);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Message, { id: assistantMessage.id }, { content: response });
      await manager.update(MessagePart, { messageId: assistantMessage.id }, { content: response });
      await this.costService.saveUsageEvent(manager, userId, model.id, assistantMessage.id, responseInputTokens, responseOutputTokens, actualCredits);
      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }
    });

    return { response, conversationId: conversation.id, messageId: assistantMessage.id };
  }

  private async processMessageLegacy(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    return await this.dataSource.transaction(async (manager) => {
      const conversation = await this.conversationService.getOrCreateConversation(userId, conversationId, modelId);
      const model = await manager.findOne(Model, { where: { id: conversation.modelId || modelId } });
      if (!model || !model.isActive) {
        throw new NotFoundException('Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.');
      }

      const inputTokens = Math.ceil(message.length / 4);
      const finalCostPoints = await this.costService.spendPointsForChat(userId, model, conversation.id, inputTokens);

      const userMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.USER, content: message });
      await manager.save(userMessage);
      await manager.save(manager.create(MessagePart, { messageId: userMessage.id, type: 'text' as any, content: message, order: 0 }));

      const aiResult = await this.generateResponse(message, model);
      const response = aiResult.content;
      const responseOutputTokens = aiResult.usage?.outputTokens ?? response.length / 4;
      const responseInputTokens = aiResult.usage?.inputTokens ?? inputTokens;

      const assistantMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: response });
      await manager.save(assistantMessage);
      await manager.save(manager.create(MessagePart, { messageId: assistantMessage.id, type: 'text' as any, content: response, order: 0 }));

      await this.costService.saveUsageEvent(manager, userId, model.id, assistantMessage.id, responseInputTokens, responseOutputTokens, finalCostPoints);

      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }

      return { response, conversationId: conversation.id, messageId: assistantMessage.id };
    });
  }

  /**
   * Simple security Q&A — no tools, direct LLM chat with SSE streaming.
   */
  async processMessageSimple(
    userId: string,
    message: string,
    conversationId: string | undefined,
    jobId: string,
    pushEvent: (ev: { type: string; data: Record<string, any> }) => void,
    options?: { emitDoneEvent?: boolean; abortSignal?: AbortSignal; model_key?: ModelOptionKey; modelIdOverride?: string },
  ): Promise<{ conversationId: string; messageId: string; response: string }> {
    const useModelPicker = !!options?.model_key;
    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.conversationService.getOrCreateConversation(userId, conversationId, undefined, useModelPicker);
      let model = conversation.modelId
        ? await manager.findOne(Model, { where: { id: conversation.modelId } })
        : null;
      if (!model || !model.isActive) {
        if (useModelPicker) {
          model = (await this.conversationService.getDefaultModelForUsage(manager)) as any;
        } else {
          throw new NotFoundException('Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.');
        }
      }

      let usageForEvent: { modelId: string; inputTokens: number; outputTokens: number; costPoints: number } | null = null;
      if (model && model.isActive) {
        const inputTokens = Math.ceil(message.length / 4);
        const costPoints = await this.costService.spendPointsForChat(userId, model, conversation.id, inputTokens);
        usageForEvent = { modelId: model.id, inputTokens, outputTokens: 500, costPoints };
      }

      const userMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.USER, content: message });
      await manager.save(userMessage);
      await manager.save(manager.create(MessagePart, { messageId: userMessage.id, type: 'text' as any, content: message, order: 0 }));

      const assistantMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: '' });
      await manager.save(assistantMessage);
      await manager.save(manager.create(MessagePart, { messageId: assistantMessage.id, type: 'text' as any, content: '', order: 0 }));

      if (usageForEvent) {
        await this.costService.saveUsageEvent(manager, userId, usageForEvent.modelId, assistantMessage.id, usageForEvent.inputTokens, usageForEvent.outputTokens, usageForEvent.costPoints);
      }

      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }

      return { conversationId: conversation.id, messageId: assistantMessage.id, model };
    });

    const { conversationId: cid, messageId: mid, model } = result;
    await this.conversationService.setConversationRunStatus(cid, 'running');

    const push = (ev: { type: string; data: Record<string, any> }) => pushEvent({ type: ev.type, data: ev.data });
    const emitDoneEvent = options?.emitDoneEvent !== false;
    const abortSignal = options?.abortSignal;

    push({ type: 'status', data: { message: 'Replying...', simple_mode: true } });
    if (abortSignal?.aborted) {
      await this.conversationService.setConversationRunStatus(cid, 'stopped');
      throw new Error('Request was cancelled');
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: GWEHAI_CONVERSATION_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];
    let content: string;
    const modelKey = options?.model_key || (!model ? 'auto' : undefined);
    let llmFailed = false;
    if (modelKey) {
      try {
        const llmResult = await this.providerRouter.runChatCompletion({
          selectedModelKey: modelKey,
          selectedModelIdOverride: options?.modelIdOverride,
          messages,
          mode: 'decision',
        });
        content = llmResult.text?.trim() ? llmResult.text.trim() : this.agentOrchestrator['generateLocalResponse'](message);
        if (llmResult.meta && this.costManager.isCostDebug()) {
          pushEvent({ type: 'meta', data: llmResult.meta });
        }
      } catch (err: any) {
        console.error(`[ChatService] runChatCompletion failed (key=${modelKey}): ${err?.message}`);
        llmFailed = true;
      }
    }
    if (!modelKey || llmFailed) {
      try {
        const response = await this.llmService.generate(model!, messages);
        content = response?.content?.trim()
          ? response.content.trim()
          : this.agentOrchestrator['generateLocalResponse'](message);
      } catch (err: any) {
        console.error(`[ChatService] llmService.generate failed (model=${model?.name}): ${err?.message}`);
        content = this.agentOrchestrator['generateLocalResponse'](message);
      }
    }

    if (abortSignal?.aborted) {
      await this.conversationService.setConversationRunStatus(cid, 'stopped');
      throw new Error('Request was cancelled');
    }

    const { reply, details, followUps } = this.agentOrchestrator.parseConversationJson(content);

    // Stream reply in chunks with typing effect
    const CHUNK_SIZE = 60;
    const TYPING_DELAY_MS = 18;
    for (let i = 0; i < reply.length; i += CHUNK_SIZE) {
      const delta = reply.slice(i, i + CHUNK_SIZE);
      push({ type: 'message_delta', data: { message_id: mid, delta } });
      if (TYPING_DELAY_MS > 0 && i + CHUNK_SIZE < reply.length) {
        await new Promise((r) => setTimeout(r, TYPING_DELAY_MS));
      }
    }
    push({ type: 'message_done', data: { message_id: mid, content: reply } });
    if (details !== undefined || (followUps !== undefined && followUps.length > 0)) {
      push({ type: 'simple_response', data: { message_id: mid, reply, details, followUps: followUps ?? [] } });
      // Persist details/followUps so they survive page refresh & chat switching
      this.conversationService.saveMessageMeta(mid, { details, followUps }).catch((err) =>
        console.warn('Failed to save message meta (details/followUps):', err?.message),
      );
    }

    await this.conversationService.updateMessageContent(mid, reply);
    await this.conversationService.setConversationRunStatus(cid, 'finished');
    if (emitDoneEvent) {
      push({ type: 'done', data: { job_id: jobId, conversation_id: cid } });
    }

    return { conversationId: cid, messageId: mid, response: reply };
  }

  /**
   * Non-streaming simple conversation.
   */
  async getSimpleConversationResponse(
    userId: string,
    message: string,
    options?: { conversationId?: string; model_key?: ModelOptionKey; modelIdOverride?: string },
  ): Promise<{ reply: string; details?: string; followUps?: string[]; conversationId: string; messageId: string }> {
    const useModelPicker = !!options?.model_key;
    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.conversationService.getOrCreateConversation(userId, options?.conversationId, undefined, useModelPicker);
      let model = conversation.modelId
        ? await manager.findOne(Model, { where: { id: conversation.modelId } })
        : null;
      if (!model || !model.isActive) {
        if (useModelPicker) {
          model = (await this.conversationService.getDefaultModelForUsage(manager)) as any;
        } else {
          throw new NotFoundException('Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.');
        }
      }

      if (model && model.isActive) {
        await this.costService.spendPointsForChat(userId, model, conversation.id, Math.ceil(message.length / 4));
      }

      const userMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.USER, content: message });
      await manager.save(userMessage);
      await manager.save(manager.create(MessagePart, { messageId: userMessage.id, type: 'text' as any, content: message, order: 0 }));

      const assistantMessage = manager.create(Message, { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: '' });
      await manager.save(assistantMessage);
      await manager.save(manager.create(MessagePart, { messageId: assistantMessage.id, type: 'text' as any, content: '', order: 0 }));

      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }

      return { conversationId: conversation.id, messageId: assistantMessage.id, model };
    });

    const messages: LlmMessage[] = [
      { role: 'system', content: GWEHAI_CONVERSATION_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];
    const modelKey = options?.model_key || (!result.model ? 'auto' : undefined);
    let content: string;
    if (modelKey) {
      const llmResult = await this.providerRouter.runChatCompletion({
        selectedModelKey: modelKey,
        selectedModelIdOverride: options?.modelIdOverride,
        messages,
        mode: 'decision',
      });
      content = llmResult.text?.trim() ? llmResult.text.trim() : this.agentOrchestrator['generateLocalResponse'](message);
    } else {
      const response = await this.llmService.generate(result.model!, messages);
      content = response?.content?.trim() ? response.content.trim() : this.agentOrchestrator['generateLocalResponse'](message);
    }

    const { reply, details, followUps } = this.agentOrchestrator.parseConversationJson(content);
    await this.conversationService.updateMessageContent(result.messageId, reply);

    const out: { reply: string; details?: string; followUps?: string[]; conversationId: string; messageId: string } = {
      reply,
      conversationId: result.conversationId,
      messageId: result.messageId,
    };
    if (details !== undefined) out.details = details;
    if (followUps !== undefined && followUps.length > 0) out.followUps = followUps;
    return out;
  }

  /**
   * Process message with tool loop — delegates to AgentOrchestratorService.
   */
  async processMessageWithTools(
    userId: string,
    message: string,
    conversationId: string | undefined,
    jobId: string,
    pushEvent: (ev: { type: string; data: Record<string, any> }) => void,
    agentInfo?: { index: number; label: string },
    memoryScopeIdOverride?: string,
    options?: { emitDoneEvent?: boolean; abortSignal?: AbortSignal; model_key?: ModelOptionKey; modelIdOverride?: string; maxAgentsForRun?: number },
  ): Promise<{ conversationId: string; messageId: string; response: string }> {
    return this.agentOrchestrator.processMessageWithTools(
      userId, message, conversationId, jobId, pushEvent, agentInfo, memoryScopeIdOverride, options,
    );
  }

  /**
   * Send a message to another session — delegates to AgentOrchestratorService.
   */
  async sendToSession(
    userId: string,
    currentConversationId: string,
    toConversationId: string,
    message: string,
    waitForReply: boolean = true,
    mainPushEvent?: (ev: { type: string; data: Record<string, any> }) => void,
    subAgentLabel?: string,
    subAgentIndex?: number,
    parentMemoryScope?: string,
    onSubAgentDone?: () => void | Promise<void>,
    abortSignal?: AbortSignal,
    modelKey?: ModelOptionKey,
  ): Promise<{ ok: true; message?: string } | { ok: true; reply: string }> {
    // For backward compat, we delegate to the orchestrator's processMessageWithTools
    // which handles sessions_send internally
    const agentInfo = subAgentLabel != null && subAgentIndex != null
      ? { index: subAgentIndex, label: subAgentLabel }
      : undefined;

    if (waitForReply) {
      const result = await this.agentOrchestrator.processMessageWithTools(
        userId, message.trim(), toConversationId, toConversationId,
        mainPushEvent ?? (() => {}), agentInfo, parentMemoryScope ?? currentConversationId,
        { emitDoneEvent: false, abortSignal, ...(modelKey && { model_key: modelKey }) },
      );
      if (agentInfo) {
        (mainPushEvent ?? (() => {}))({
          type: 'status',
          data: { message: "I'm done with my work. Please continue with the next step." },
        });
      }
      return { ok: true, reply: result.response };
    }

    // Background sub-agent
    await this.conversationService.saveUserMessage(toConversationId, message.trim());

    const push = mainPushEvent && agentInfo
      ? (ev: { type: string; data: Record<string, any> }) => {
          const isSubAgent = (agentInfo?.index ?? 1) > 1;
          if (isSubAgent && (ev.type === 'message_delta' || ev.type === 'message_done' || ev.type === 'content' || ev.type === 'content_done' || ev.type === 'reasoning_block')) {
            return;
          }
          mainPushEvent({
            type: ev.type,
            data: { ...ev.data, agent_index: agentInfo.index, agent_label: agentInfo.label },
          });
        }
      : mainPushEvent ?? (() => {});

    void this.agentOrchestrator.processMessageWithTools(
      userId, message.trim(), toConversationId, toConversationId,
      push, agentInfo, parentMemoryScope ?? currentConversationId,
      { emitDoneEvent: false, abortSignal, ...(modelKey && { model_key: modelKey }) },
    ).then(async () => {
      if (agentInfo) {
        push({ type: 'status', data: { message: "I'm done with my work. Please continue with the next step." } });
      }
      await onSubAgentDone?.();
    }).catch(async (err: any) => {
      if (mainPushEvent && agentInfo) {
        const raw = err?.message ?? err?.response?.message ?? String(err);
        mainPushEvent({
          type: 'error',
          data: { message: normalizeLlmErrorMessage(raw), agent_index: agentInfo.index, agent_label: agentInfo.label },
        });
      }
      await onSubAgentDone?.();
    });

    return { ok: true, message: 'Message sent (sub-agent running in background)' };
  }

  // ─── Private helpers (kept for legacy billing flows) ────────────────────

  private async generateResponse(
    message: string,
    model: Model,
  ): Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const llmMessages: LlmMessage[] = [
      { role: 'system', content: PENTEST_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];
    try {
      const llmResult = await this.llmService.generate(model, llmMessages);
      if (llmResult && llmResult.content) {
        return { content: llmResult.content, usage: llmResult.usage };
      }
    } catch (err: any) {
      console.error(`[ChatService] generateResponse failed (model=${model?.name}): ${err?.message}`);
      // Fall through to local response
    }
    const fallback = this.agentOrchestrator['generateLocalResponse'](message);
    return { content: fallback };
  }
}
