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

/** Small delay so SSE client receives events over time and frontend typing effect can run */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conversation id is a UUID; reject timestamps or other non-UUID values to avoid Postgres "invalid input syntax for type uuid". */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireUuid(id: unknown, paramName: string): void {
  const s = typeof id === 'string' ? id.trim() : String(id ?? '');
  if (!s || !UUID_REGEX.test(s)) {
    throw new BadRequestException(`${paramName} must be a valid UUID`);
  }
}

/** Message-count guard for context window. Keeps system + first user + last N. */
const MAX_MESSAGES_FOR_CONTEXT = 40;
/** Global content-size guard (character based) before each LLM call. */
const MAX_CONTEXT_TOTAL_CHARS = 120_000;
/** Per-message caps so huge tool outputs do not bloat context. */
const MAX_CONTEXT_CHARS_PER_ROLE = {
  system: 16_000,
  user: 10_000,
  assistant: 7_000,
  tool: 3_500,
  default: 6_000,
} as const;

function clipTextPreserveHeadTail(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  if (maxChars <= 200) return text.slice(0, maxChars);
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(80, maxChars - head - 80);
  return `${text.slice(0, head)}\n\n...[truncated for context]...\n\n${text.slice(-tail)}`;
}

function maxCharsForRole(role?: string): number {
  switch (role) {
    case 'system':
      return MAX_CONTEXT_CHARS_PER_ROLE.system;
    case 'user':
      return MAX_CONTEXT_CHARS_PER_ROLE.user;
    case 'assistant':
      return MAX_CONTEXT_CHARS_PER_ROLE.assistant;
    case 'tool':
      return MAX_CONTEXT_CHARS_PER_ROLE.tool;
    default:
      return MAX_CONTEXT_CHARS_PER_ROLE.default;
  }
}

function compactMessageForContext(msg: LlmMessage): LlmMessage {
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (!content) return msg;
  const maxChars = maxCharsForRole(msg.role);
  if (content.length <= maxChars) return msg;
  return {
    ...msg,
    content: clipTextPreserveHeadTail(content, maxChars),
  };
}

function estimateChars(messages: LlmMessage[]): number {
  return messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
}

function normalizeToolMessageOrder(messages: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  const openToolCallIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      out.push(msg);
      for (const tc of msg.tool_calls ?? []) {
        if (tc?.id) openToolCallIds.add(tc.id);
      }
      continue;
    }

    if (msg.role === 'tool') {
      const tcid = String(msg.tool_call_id ?? '').trim();
      if (!tcid || !openToolCallIds.has(tcid)) {
        // Drop dangling/orphan tool message caused by context truncation.
        continue;
      }
      out.push(msg);
      openToolCallIds.delete(tcid);
      continue;
    }

    out.push(msg);
  }

  return out;
}

function truncateMessagesForContext(messages: LlmMessage[], max = MAX_MESSAGES_FOR_CONTEXT): LlmMessage[] {
  const kept = messages.length <= max
    ? messages
    : (() => {
        const system = messages[0]?.role === 'system' ? [messages[0]] : [];
        const firstUser = messages[1]?.role === 'user' ? [messages[1]] : [];
        const rest = messages.slice(system.length + firstUser.length);
        const tail = rest.slice(-(max - system.length - firstUser.length));
        return [...system, ...firstUser, ...tail];
      })();

  // First pass: per-message clipping (especially tool outputs).
  let compacted = kept.map(compactMessageForContext);

  // Second pass: global budget guard; drop oldest non-anchor messages if still too large.
  while (estimateChars(compacted) > MAX_CONTEXT_TOTAL_CHARS && compacted.length > 3) {
    const anchorOffset = compacted[0]?.role === 'system' ? 1 : 0;
    const firstUserOffset = compacted[anchorOffset]?.role === 'user' ? 1 : 0;
    const dropIndex = anchorOffset + firstUserOffset; // oldest non-anchor
    compacted = compacted.filter((_, idx) => idx !== dropIndex);
  }

  // Final pass: harder clipping if still above budget.
  if (estimateChars(compacted) > MAX_CONTEXT_TOTAL_CHARS) {
    compacted = compacted.map((m, idx) => {
      const isSystem = idx === 0 && m.role === 'system';
      const isFirstUser = (idx === 1 && compacted[0]?.role === 'system' && m.role === 'user') || (idx === 0 && m.role === 'user');
      const hardLimit = isSystem ? 8_000 : isFirstUser ? 6_000 : (m.role === 'tool' ? 1_500 : 2_500);
      const content = typeof m.content === 'string' ? m.content : '';
      if (!content || content.length <= hardLimit) return m;
      return { ...m, content: clipTextPreserveHeadTail(content, hardLimit) };
    });
  }

  return normalizeToolMessageOrder(compacted);
}

@Injectable()
export class ChatService {
  constructor(
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
    @Optional() private billingConfig?: BillingConfigService,
    @Optional() private costCalculator?: CostCalculatorService,
  ) {}

  /** Tracks main-agent done + pending sub-agents per parent conversation so we only set "finished" and push "done" when all work is complete. */
  private readonly pendingSubAgentsByParent = new Map<string, { mainDone: boolean; pending: number }>();
  /** Resolvers for callers waiting until conversation is fully finished (main + all sub-agents). */
  private readonly pendingFinishResolvers = new Map<string, () => void>();

  /**
   * Mark main agent done for cid; if no pending sub-agents, set runStatus finished and optionally push done.
   * If there are pending sub-agents, returns a Promise that resolves when the last sub-agent finishes (so callers can wait before marking job "completed").
   */
  private async tryMarkMainDoneAndMaybeFinish(
    cid: string,
    emitDoneEvent: boolean,
    push: (ev: { type: string; data: Record<string, any> }) => void,
    jobId: string,
  ): Promise<void> {
    let state = this.pendingSubAgentsByParent.get(cid);
    if (!state) state = { mainDone: false, pending: 0 };
    state.mainDone = true;
    this.pendingSubAgentsByParent.set(cid, state);
    if (state.pending === 0) {
      this.pendingSubAgentsByParent.delete(cid);
      await this.setConversationRunStatus(cid, 'finished');
      if (emitDoneEvent) {
        push({ type: 'done', data: { job_id: jobId, conversation_id: cid } });
      }
      return;
    }
    return new Promise<void>((resolve) => {
      this.pendingFinishResolvers.set(cid, resolve);
    });
  }

  /** Called when a sub-agent (wait_for_reply: false) completes; decrements pending and may set finished + push done. */
  private async tryFinishParentAfterSubAgent(
    parentCid: string,
    jobId: string,
    push: (ev: { type: string; data: Record<string, any> }) => void,
  ): Promise<void> {
    const state = this.pendingSubAgentsByParent.get(parentCid);
    if (!state) return;
    state.pending = Math.max(0, state.pending - 1);
    if (state.mainDone && state.pending <= 0) {
      this.pendingSubAgentsByParent.delete(parentCid);
      const conv = await this.conversationRepo.findOne({ where: { id: parentCid }, select: ['runStatus'] });
      if (conv?.runStatus === 'stopped') {
        this.pendingFinishResolvers.get(parentCid)?.();
        this.pendingFinishResolvers.delete(parentCid);
        return;
      }
      await this.setConversationRunStatus(parentCid, 'finished');
      push({ type: 'done', data: { job_id: jobId, conversation_id: parentCid } });
      this.pendingFinishResolvers.get(parentCid)?.();
      this.pendingFinishResolvers.delete(parentCid);
    } else {
      this.pendingSubAgentsByParent.set(parentCid, state);
    }
  }

  private readonly securityKnowledge = {
    'sql injection': {
      explanation: 'SQL Injection is a code injection technique that exploits security vulnerabilities in an application\'s database layer. Attackers can manipulate SQL queries by injecting malicious SQL code through user input.',
      impact: 'High - Can lead to unauthorized data access, data manipulation, or complete database compromise.',
      remediation: 'Use parameterized queries, input validation, least privilege database accounts, and Web Application Firewalls (WAF).',
    },
    'xss': {
      explanation: 'Cross-Site Scripting (XSS) allows attackers to inject malicious scripts into web pages viewed by other users. There are three types: Stored XSS, Reflected XSS, and DOM-based XSS.',
      impact: 'Medium to High - Can steal session tokens, credentials, or perform actions on behalf of users.',
      remediation: 'Implement Content Security Policy (CSP), sanitize user input, use output encoding, and validate all user-supplied data.',
    },
    'owasp top 10': {
      explanation: 'The OWASP Top 10 is a standard awareness document representing the most critical security risks to web applications. The current version (2021) includes: Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable Components, Authentication Failures, Software and Data Integrity Failures, Security Logging Failures, and Server-Side Request Forgery.',
      impact: 'Varies by vulnerability type.',
      remediation: 'Follow OWASP guidelines, implement secure coding practices, and conduct regular security assessments.',
    },
  };

  /**
   * Resolve a model to use for usage recording when the conversation has no DB model (e.g. Auto / model picker).
   * Uses default active model or first active model so we can always write UsageEvent and spend points.
   */
  private async getDefaultModelForUsage(manager: EntityManager): Promise<Model | null> {
    const repo = manager.getRepository(Model);
    let m = await repo.findOne({ where: { isDefault: true, isActive: true } });
    if (!m) m = await repo.findOne({ where: { name: 'deepseek/deepseek-chat', isActive: true } });
    if (!m) m = await repo.findOne({ where: { isActive: true } });
    return m;
  }

  /**
   * Get or create conversation.
   * When skipDefaultModel is true (e.g. caller uses model picker / Auto), new conversations are created with modelId = null so we never depend on a DB model.
   */
  async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    modelId?: string,
    skipDefaultModel?: boolean,
  ): Promise<Conversation> {
    if (conversationId) {
      const conversation = await this.conversationRepo.findOne({
        where: { id: conversationId, userId },
        relations: ['messages', 'messages.parts'],
      });
      if (conversation) {
        return conversation;
      }
      throw new NotFoundException('Conversation not found');
    }

    // When using model picker (Auto), don't attach a DB model so we never hit "Model not found"
    if (!skipDefaultModel && !modelId) {
      let defaultModel = await this.modelRepo.findOne({
        where: { isDefault: true, isActive: true },
      });
      if (!defaultModel) {
        defaultModel = await this.modelRepo.findOne({
          where: { name: 'deepseek/deepseek-chat', isActive: true },
        });
      }
      if (defaultModel) {
        modelId = defaultModel.id;
      }
    }

    // Create new conversation
    const conversation = this.conversationRepo.create({
      userId,
      modelId: skipDefaultModel ? undefined : modelId,
      title: 'New Conversation',
    });
    return await this.conversationRepo.save(conversation);
  }

  /**
   * Create a single conversation with an initial seed message (e.g. pentest job context).
   * Used by Pentest Job Runner: one job = one conversation = one pentest context.
   */
  async createConversationWithSeed(
    userId: string,
    title: string,
    seedMessage: string,
    modelId?: string,
    pentestJobId?: string,
  ): Promise<Conversation> {
    const conversation = await this.getOrCreateConversation(userId, undefined, modelId);
    conversation.title = title;
    if (pentestJobId) conversation.pentestJobId = pentestJobId;
    await this.conversationRepo.save(conversation);

    const userMessage = this.messageRepo.create({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: seedMessage,
    });
    await this.messageRepo.save(userMessage);

    const part = this.messagePartRepo.create({
      messageId: userMessage.id,
      type: MessagePartType.TEXT,
      content: seedMessage,
      order: 0,
    });
    await this.messagePartRepo.save(part);

    return conversation;
  }

  /**
   * Process message with points deduction (ACID-safe).
   * When POINTS_ENABLED and dynamic billing config is available, uses reserve → settle and CostCalculator.
   */
  async processMessage(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    const useDynamicBilling =
      POINTS_ENABLED &&
      this.billingConfig &&
      this.costCalculator &&
      (await this.tryGetBillingSnapshot());

    if (useDynamicBilling && this.billingConfig && this.costCalculator) {
      return this.processMessageWithDynamicBilling(userId, message, conversationId, modelId);
    }
    return this.processMessageLegacy(userId, message, conversationId, modelId);
  }

  private async tryGetBillingSnapshot() {
    try {
      await this.billingConfig!.getSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  private async processMessageWithDynamicBilling(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    const snapshot = await this.billingConfig!.getSnapshot();
    const planId = await this.planResolution.getUserPlan(userId);
    const modelKey = await this.billingConfig!.resolveModelForPlan(planId, null);
    const estimatedOutput = this.costCalculator!.estimateOutputTokensForReserve(undefined);
    const inputTokensEst = Math.ceil(message.length / 4);
    const reserveResult = this.costCalculator!.computeCredits(snapshot, {
      planId,
      opType: 'chat_turn',
      modelKey,
      inputTokens: inputTokensEst,
      outputTokens: estimatedOutput,
    });
    const reservedCredits = reserveResult.credits;

    const { conversation, model, assistantMessage } = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.getOrCreateConversation(userId, conversationId, modelId);
      const model = await manager.findOne(Model, {
        where: { id: conversation.modelId || modelId },
      });
      if (!model || !model.isActive) {
        throw new NotFoundException(
          'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
        );
      }
      const userMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      });
      await manager.save(userMessage);
      const userMessagePart = manager.create(MessagePart, {
        messageId: userMessage.id,
        type: 'text' as any,
        content: message,
        order: 0,
      });
      await manager.save(userMessagePart);
      const assistantMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: '',
      });
      await manager.save(assistantMessage);
      const assistantMessagePart = manager.create(MessagePart, {
        messageId: assistantMessage.id,
        type: 'text' as any,
        content: '',
        order: 0,
      });
      await manager.save(assistantMessagePart);
      return { conversation, model, assistantMessage };
    });

    await this.pointsService.reserveCredits(userId, reservedCredits, assistantMessage.id);

    const aiResult = await this.generateResponse(message, model);
    const response = aiResult.content;
    const responseOutputTokens = aiResult.usage?.outputTokens ?? Math.ceil(response.length / 4);
    const responseInputTokens = aiResult.usage?.inputTokens ?? inputTokensEst;

    const actualResult = this.costCalculator!.computeCredits(snapshot, {
      planId,
      opType: 'chat_turn',
      modelKey,
      inputTokens: responseInputTokens,
      outputTokens: responseOutputTokens,
    });
    const actualCredits = actualResult.credits;

    await this.pointsService.settleCredits(userId, assistantMessage.id, reservedCredits, actualCredits);

    await this.dataSource.transaction(async (manager) => {
      const assistantMsg = await manager.findOne(Message, { where: { id: assistantMessage.id } });
      if (assistantMsg) {
        assistantMsg.content = response;
        await manager.save(assistantMsg);
      }
      const part = await manager.findOne(MessagePart, {
        where: { messageId: assistantMessage.id },
      });
      if (part) {
        part.content = response;
        await manager.save(part);
      }
      const usageEvent = manager.create(UsageEvent, {
        userId,
        modelId: model.id,
        messageId: assistantMessage.id,
        inputTokens: responseInputTokens,
        outputTokens: responseOutputTokens,
        costPoints: actualCredits,
      });
      await manager.save(usageEvent);
      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }
    });

    return {
      response,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
    };
  }

  private async processMessageLegacy(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    return await this.dataSource.transaction(async (manager) => {
      const conversation = await this.getOrCreateConversation(userId, conversationId, modelId);
      const model = await manager.findOne(Model, {
        where: { id: conversation.modelId || modelId },
      });

      if (!model || !model.isActive) {
        throw new NotFoundException(
          'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
        );
      }

      const inputTokens = Math.ceil(message.length / 4);
      const outputTokens = 500;
      const fixedCostPoints = this.getFixedCostPoints(model);
      const costPoints =
        fixedCostPoints !== null
          ? fixedCostPoints
          : (Number(model.pointsPer1kInputTokens) * inputTokens) / 1000 +
            (Number(model.pointsPer1kOutputTokens) * outputTokens) / 1000;

      const finalCostPoints =
        fixedCostPoints !== null
          ? this.normalizePoints(costPoints)
          : Math.max(1, Math.ceil(costPoints));

      await this.pointsService.spendPoints(
        userId,
        finalCostPoints,
        PointLedgerReason.CHAT_USAGE,
        'usage_events',
        null,
        { modelId: model.id, conversationId: conversation.id },
      );

      const userMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      });
      await manager.save(userMessage);

      const userMessagePart = manager.create(MessagePart, {
        messageId: userMessage.id,
        type: 'text' as any,
        content: message,
        order: 0,
      });
      await manager.save(userMessagePart);

      const aiResult = await this.generateResponse(message, model);
      const response = aiResult.content;
      const responseOutputTokens =
        aiResult.usage?.outputTokens ?? response.length / 4;
      const responseInputTokens =
        aiResult.usage?.inputTokens ?? inputTokens;

      const assistantMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: response,
      });
      await manager.save(assistantMessage);

      const assistantMessagePart = manager.create(MessagePart, {
        messageId: assistantMessage.id,
        type: 'text' as any,
        content: response,
        order: 0,
      });
      await manager.save(assistantMessagePart);

      const usageEvent = manager.create(UsageEvent, {
        userId,
        modelId: model.id,
        messageId: assistantMessage.id,
        inputTokens: responseInputTokens,
        outputTokens: responseOutputTokens,
        costPoints: finalCostPoints,
      });
      await manager.save(usageEvent);

      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }

      return {
        response,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
      };
    });
  }

  /**
   * Simple security Q&A when the user did not give a target host. No tools, no memory; direct LLM chat.
   * Streams reply via message_delta / message_done and saves the assistant message.
   */
  async processMessageSimple(
    userId: string,
    message: string,
    conversationId: string | undefined,
    jobId: string,
    pushEvent: (ev: { type: string; data: Record<string, any> }) => void,
    options?: { emitDoneEvent?: boolean; abortSignal?: AbortSignal; model_key?: ModelOptionKey },
  ): Promise<{ conversationId: string; messageId: string; response: string }> {
    const useModelPicker = !!options?.model_key;
    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.getOrCreateConversation(userId, conversationId, undefined, useModelPicker);
      let model = conversation.modelId
        ? await manager.findOne(Model, { where: { id: conversation.modelId } })
        : null;
      if (!model || !model.isActive) {
        if (useModelPicker) {
          model = (await this.getDefaultModelForUsage(manager)) as any;
        } else {
          throw new NotFoundException(
            'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
          );
        }
      }

      let usageForEvent: { modelId: string; inputTokens: number; outputTokens: number; costPoints: number } | null = null;
      if (model && model.isActive) {
        const inputTokens = Math.ceil(message.length / 4);
        const outputTokens = 500;
        const fixedCostPoints = this.getFixedCostPoints(model);
        const costPoints =
          fixedCostPoints !== null
            ? fixedCostPoints
            : (Number(model.pointsPer1kInputTokens) * inputTokens) / 1000 +
              (Number(model.pointsPer1kOutputTokens) * outputTokens) / 1000;
        const finalCostPoints =
          fixedCostPoints !== null
            ? this.normalizePoints(costPoints)
            : Math.max(1, Math.ceil(costPoints));

        await this.pointsService.spendPoints(
          userId,
          finalCostPoints,
          PointLedgerReason.CHAT_USAGE,
          'usage_events',
          null,
          { modelId: model.id, conversationId: conversation.id },
        );
        usageForEvent = { modelId: model.id, inputTokens, outputTokens, costPoints: finalCostPoints };
      }

      const userMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      });
      await manager.save(userMessage);

      const userMessagePart = manager.create(MessagePart, {
        messageId: userMessage.id,
        type: 'text' as any,
        content: message,
        order: 0,
      });
      await manager.save(userMessagePart);

      const assistantMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: '',
      });
      await manager.save(assistantMessage);

      const assistantMessagePart = manager.create(MessagePart, {
        messageId: assistantMessage.id,
        type: 'text' as any,
        content: '',
        order: 0,
      });
      await manager.save(assistantMessagePart);

      if (usageForEvent) {
        const u = manager.create(UsageEvent, {
          userId,
          modelId: usageForEvent.modelId,
          messageId: assistantMessage.id,
          inputTokens: usageForEvent.inputTokens,
          outputTokens: usageForEvent.outputTokens,
          costPoints: usageForEvent.costPoints,
        });
        await manager.save(u);
      }

      if (!conversation.title || conversation.title === 'New Conversation') {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }

      return {
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        model,
      };
    });

    const { conversationId: cid, messageId: mid, model } = result;
    await this.setConversationRunStatus(cid, 'running');

    const push = (ev: { type: string; data: Record<string, any> }) => pushEvent({ type: ev.type, data: ev.data });
    const emitDoneEvent = options?.emitDoneEvent !== false;
    const abortSignal = options?.abortSignal;

    push({ type: 'status', data: { message: 'Replying...', simple_mode: true } });
    if (abortSignal?.aborted) {
      await this.setConversationRunStatus(cid, 'stopped');
      throw new Error('Request was cancelled');
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: GWEHAI_CONVERSATION_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];
    let content: string;
    // Auto = DeepSeek. Use provider router when model_key is set or when we have no DB model.
    const modelKey = options?.model_key || (!model ? 'auto' : undefined);
    if (modelKey) {
      const result = await this.providerRouter.runChatCompletion({
        selectedModelKey: modelKey,
        messages,
        mode: 'decision',
      });
      content = result.text?.trim() ? result.text.trim() : this.generateLocalResponse(message);
      if (result.meta && this.costManager.isCostDebug()) {
        pushEvent({ type: 'meta', data: result.meta });
      }
    } else {
      const response = await this.llmService.generate(model, messages);
      content = response?.content?.trim()
        ? response.content.trim()
        : this.generateLocalResponse(message);
    }

    if (abortSignal?.aborted) {
      await this.setConversationRunStatus(cid, 'stopped');
      throw new Error('Request was cancelled');
    }

    const { reply, details, followUps } = this.parseConversationJson(content);

    // Stream reply in chunks with a short delay so the frontend shows a typing effect
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
      push({
        type: 'simple_response',
        data: { message_id: mid, reply, details, followUps: followUps ?? [] },
      });
    }

    await this.messageRepo.update(mid, { content: reply });
    await this.messagePartRepo.update({ messageId: mid }, { content: reply });

    await this.setConversationRunStatus(cid, 'finished');
    if (emitDoneEvent) {
      push({ type: 'done', data: { job_id: jobId, conversation_id: cid } });
    }

    return { conversationId: cid, messageId: mid, response: reply };
  }

  /**
   * Non-streaming simple conversation: returns { reply, details?, followUps? } for POST /chat/conversation.
   * Uses the same GwehAI identity prompt and JSON contract; persists the conversation and messages.
   */
  async getSimpleConversationResponse(
    userId: string,
    message: string,
    options?: { conversationId?: string; model_key?: ModelOptionKey },
  ): Promise<{ reply: string; details?: string; followUps?: string[]; conversationId: string; messageId: string }> {
    const useModelPicker = !!options?.model_key;
    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.getOrCreateConversation(userId, options?.conversationId, undefined, useModelPicker);
      let model = conversation.modelId
        ? await manager.findOne(Model, { where: { id: conversation.modelId } })
        : null;
      if (!model || !model.isActive) {
        if (useModelPicker) {
          model = (await this.getDefaultModelForUsage(manager)) as any;
        } else {
          throw new NotFoundException(
            'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
          );
        }
      }

      if (model && model.isActive) {
        const inputTokens = Math.ceil(message.length / 4);
        const outputTokens = 500;
        const fixedCostPoints = this.getFixedCostPoints(model);
        const costPoints =
          fixedCostPoints !== null
            ? fixedCostPoints
            : (Number(model.pointsPer1kInputTokens) * inputTokens) / 1000 +
              (Number(model.pointsPer1kOutputTokens) * outputTokens) / 1000;
        const finalCostPoints =
          fixedCostPoints !== null ? this.normalizePoints(costPoints) : Math.max(1, Math.ceil(costPoints));
        await this.pointsService.spendPoints(
          userId,
          finalCostPoints,
          PointLedgerReason.CHAT_USAGE,
          'usage_events',
          null,
          { modelId: model.id, conversationId: conversation.id },
        );
      }

      const userMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      });
      await manager.save(userMessage);

      const userMessagePart = manager.create(MessagePart, {
        messageId: userMessage.id,
        type: 'text' as any,
        content: message,
        order: 0,
      });
      await manager.save(userMessagePart);

      const assistantMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: '',
      });
      await manager.save(assistantMessage);

      const assistantMessagePart = manager.create(MessagePart, {
        messageId: assistantMessage.id,
        type: 'text' as any,
        content: '',
        order: 0,
      });
      await manager.save(assistantMessagePart);

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
        messages,
        mode: 'decision',
      });
      content = llmResult.text?.trim() ? llmResult.text.trim() : this.generateLocalResponse(message);
    } else {
      const response = await this.llmService.generate(result.model, messages);
      content = response?.content?.trim() ? response.content.trim() : this.generateLocalResponse(message);
    }

    const { reply, details, followUps } = this.parseConversationJson(content);
    await this.messageRepo.update(result.messageId, { content: reply });
    await this.messagePartRepo.update({ messageId: result.messageId }, { content: reply });

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
   * Process message with tool loop: LLM with tools ? execute tool_calls ? stream events ? repeat until done.
   * pushEvent is called for status, reasoning, tool_start, tool_log, tool_end, message_delta, message_done, done.
   * When agentInfo is set, every event includes agent_index and agent_label so the UI can show "Agent 1", "Agent 2", etc.
   * When memoryScopeIdOverride is set (e.g. for sub-agents), memory_search/memory_get/write_file use that conversation's memory so agents share the same memory.
   */
  async processMessageWithTools(
    userId: string,
    message: string,
    conversationId: string | undefined,
    jobId: string,
    pushEvent: (ev: { type: string; data: Record<string, any> }) => void,
    agentInfo?: { index: number; label: string },
    memoryScopeIdOverride?: string,
    options?: { emitDoneEvent?: boolean; abortSignal?: AbortSignal; model_key?: ModelOptionKey; maxAgentsForRun?: number },
  ): Promise<{ conversationId: string; messageId: string; response: string }> {
    const useModelPicker = !!options?.model_key;
    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.getOrCreateConversation(userId, conversationId, undefined, useModelPicker);
      let model = conversation.modelId
        ? await manager.findOne(Model, { where: { id: conversation.modelId } })
        : null;
      if (!model || !model.isActive) {
        if (useModelPicker) {
          model = (await this.getDefaultModelForUsage(manager)) as any;
        } else {
          throw new NotFoundException(
            'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
          );
        }
      }

      let usageForEvent: { modelId: string; inputTokens: number; outputTokens: number; costPoints: number } | null = null;
      if (model && model.isActive) {
        const inputTokens = Math.ceil(message.length / 4);
        const outputTokens = 500;
        const fixedCostPoints = this.getFixedCostPoints(model);
        const costPoints =
          fixedCostPoints !== null
            ? fixedCostPoints
            : (Number(model.pointsPer1kInputTokens) * inputTokens) / 1000 +
              (Number(model.pointsPer1kOutputTokens) * outputTokens) / 1000;
        const finalCostPoints =
          fixedCostPoints !== null
            ? this.normalizePoints(costPoints)
            : Math.max(1, Math.ceil(costPoints));

        await this.pointsService.spendPoints(
          userId,
          finalCostPoints,
          PointLedgerReason.CHAT_USAGE,
          'usage_events',
          null,
          { modelId: model.id, conversationId: conversation.id },
        );
        usageForEvent = { modelId: model.id, inputTokens, outputTokens, costPoints: finalCostPoints };
      }

      const userMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      });
      await manager.save(userMessage);

      const userMessagePart = manager.create(MessagePart, {
        messageId: userMessage.id,
        type: 'text' as any,
        content: message,
        order: 0,
      });
      await manager.save(userMessagePart);

      const assistantMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: '',
      });
      await manager.save(assistantMessage);

      const assistantMessagePart = manager.create(MessagePart, {
        messageId: assistantMessage.id,
        type: 'text' as any,
        content: '',
        order: 0,
      });
      await manager.save(assistantMessagePart);

      if (usageForEvent) {
        const u = manager.create(UsageEvent, {
          userId,
          modelId: usageForEvent.modelId,
          messageId: assistantMessage.id,
          inputTokens: usageForEvent.inputTokens,
          outputTokens: usageForEvent.outputTokens,
          costPoints: usageForEvent.costPoints,
        });
        await manager.save(u);
      }

      if (conversation.title === 'New Conversation' || !conversation.title) {
        conversation.title = message.substring(0, 50);
        await manager.save(conversation);
      }

      return {
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        model,
      };
    });

    const { conversationId: cid, messageId: mid, model } = result;
    await this.setConversationRunStatus(cid, 'running');

    const planId = await this.planResolution.getUserPlan(userId);
    const planDef = this.planResolution.getPlanDefinition(planId);
    const limits = planDef.limits;

    const push = (ev: { type: string; data: Record<string, any> }) => {
      const data = { ...ev.data };
      if (agentInfo) {
        // Preserve forwarded sub-agent labels/index if already attached upstream.
        if (data.agent_index == null) {
          data.agent_index = agentInfo.index;
        }
        if (data.agent_label == null) {
          data.agent_label = agentInfo.label;
        }
      }
      pushEvent({ type: ev.type, data });
    };

    const nextAgentIndexRef = { current: 2 };
    const memoryScopeId = memoryScopeIdOverride ?? cid;
    const emitDoneEvent = options?.emitDoneEvent !== false;
    const abortSignal = options?.abortSignal;

    push({ type: 'status', data: { message: 'Planning the plan...' } });

    // Load prior messages so the AI sees the seed (target, scope) and full conversation. One conversation = one pentest context; sub-agents share memory but only see the message the parent sent, so the parent must include the actual URL when delegating.
    const allMessages = await this.messageRepo.find({
      where: { conversationId: cid },
      order: { createdAt: 'ASC' },
    });
    const priorMessages = allMessages.slice(0, -2); // exclude the current user message and empty assistant message we just added
    const priorLlm: LlmMessage[] = priorMessages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content ?? '',
    }));

    let messages: LlmMessage[] = [
      { role: 'system', content: PENTEST_SYSTEM_PROMPT },
      ...priorLlm,
      { role: 'user', content: message },
    ];

    /** No forced limit — AI can keep exploring until it naturally responds with text or hits cap. */
    const MAX_TURNS = 100;
    let turn = 0;
    let finalContent = '';
    let lastStepAt = 0;
    let stepLimitReached = false;

    while (turn < MAX_TURNS) {
      if (abortSignal?.aborted) {
        throw new Error('Request was cancelled');
      }
      turn++;

      // Plan enforcement: steps_per_session and cooldown (centralized in plan-limits.validation)
      try {
        validateStep(planId, limits, {
          stepNumber: turn,
          lastStepAtMs: lastStepAt,
        });
      } catch (err: any) {
        if (err?.message?.includes('steps per session')) {
          stepLimitReached = true;
          push({ type: 'status', data: { message: 'Step limit reached for this session. Summarizing findings...' } });
          break;
        }
        throw err;
      }
      if (turn === 1) {
        const payload = getPlanPayload(planId);
        const usage = await this.planUsage.getUsage(userId, planId, cid);
        push({
          type: 'plan_info',
          data: { plan: payload.plan, limits_summary: payload.limits_summary, usage },
        });
      }

      lastStepAt = Date.now();

      // Turn 1: require tools so the agent starts with tools. After that, model chooses tools or text freely.
      const toolChoice = turn === 1 ? ('required' as const) : undefined;
      // Auto = DeepSeek. Default to 'auto' when no key so we never try to use a missing DB model.
      const modelKey = options?.model_key || 'auto';

      const toolsCap = this.costManager.getToolsOutputCap();
      const fallbackCaps = this.costManager.getCaps('auto', 'decision');
      const maxTokensForTools = toolsCap ?? fallbackCaps.maxOutputTokens;
      const response = modelKey
        ? await this.providerRouter
            .generateWithTools({
              selectedModelKey: modelKey,
              messages: truncateMessagesForContext(messages),
              tools: PENTEST_TOOL_DEFS,
              mode: 'decision',
              tool_choice: toolChoice,
            })
            .then((r) => ({ content: r.content, tool_calls: r.tool_calls }))
        : await this.llmService.generateWithTools(
            model,
            truncateMessagesForContext(messages),
            PENTEST_TOOL_DEFS,
            { tool_choice: toolChoice, max_tokens: maxTokensForTools },
          );
      if (!response) {
        finalContent = this.generateLocalResponse(message);
        break;
      }

      // Show a short model-text preview in SSE activity so UI can display "Text: ...".
      const responsePreview = this.formatAssistantTextPreview(response.content || '');
      if (responsePreview) {
        push({ type: 'status', data: { message: `Text: ${responsePreview}` } });
      }

      if (response.tool_calls && response.tool_calls.length > 0) {
        push({ type: 'status', data: { message: 'Running tools...' } });
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.tool_calls,
        });

        for (const tc of response.tool_calls) {
          if (abortSignal?.aborted) {
            throw new Error('Request was cancelled');
          }
          let args: Record<string, any> = {};
          try {
            const parsed = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments;
            args = parsed && typeof parsed === 'object' ? parsed : {};
          } catch {
            args = {};
          }

          const stepDescription = this.formatToolReasoning(tc.name, args);
          push({ type: 'status', data: { message: stepDescription } });

          let toolResult: string;
          try {
            toolResult = await this.runTool(tc.name, args, jobId, cid, userId, push, memoryScopeId, nextAgentIndexRef, abortSignal, options?.model_key, options?.maxAgentsForRun);
          } catch (err: any) {
            toolResult = `Error: ${err?.message || String(err)}`;
          }

          // Wait for tool to finish, then save output to DB so Hacktivity shows tool content before we continue.
          if (userId) {
            const domain = this.extractDomainFromArgs(args);
            try {
              await this.hacktivityService.create(userId, {
                conversationId: cid ?? null,
                domain: domain ?? null,
                result: toolResult,
                toolArgs: args,
              });
            } catch (err: any) {
              console.warn('[Hacktivity] log failed', err?.message);
            }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: clipTextPreserveHeadTail(toolResult, MAX_CONTEXT_CHARS_PER_ROLE.tool),
          });
          // Emit tool output so pentest Runner page (and any listener) can show scanner/exec output live.
          push({
            type: 'tool_log',
            data: {
              tool: tc.name,
              output: clipTextPreserveHeadTail(toolResult, 4000),
            },
          });
        }
        const tokensThisTurn =
          Math.ceil((response.content?.length || 0) / 4) + 500 + (response.tool_calls?.length || 0) * 200;
        await this.planUsage.recordStep(userId, cid, tokensThisTurn);
        push({ type: 'status', data: { message: 'Planning next plan...' } });
        continue;
      }

      finalContent = response.content || '';
      const tokensFinalTurn = Math.ceil((response.content?.length || 0) / 4) + 500;
      await this.planUsage.recordStep(userId, cid, tokensFinalTurn);
      break;
    }

    // If we hit MAX_TURNS or step limit without any text reply, ask the model once for a summary (no tools).
    const modelKeySummary = options?.model_key || 'auto';
    if (!finalContent?.trim()) {
      push({ type: 'status', data: { message: 'Writing response...' } });
      const summaryPrompt = stepLimitReached
        ? 'Step limit for this session was reached. Summarize what you found so far (list each report_finding). In <final>, also list which checklist areas you did NOT get to test (e.g. XSS, LFI, auth) so the user knows. Reply only with <think>brief</think> then <final>summary + unchecked areas</final>. No tool calls.'
        : 'Summarize what you did so far. Reply only with <think>brief reasoning</think> then <final>your summary for the user</final>. No tool calls.';
      const summaryMessage: LlmMessage = {
        role: 'user',
        content: summaryPrompt,
      };
      const summaryMessages = truncateMessagesForContext([...messages, summaryMessage]);
      const summaryCaps = this.costManager.getToolsOutputCap() ?? this.costManager.getCaps('auto', 'decision').maxOutputTokens;
      const summaryResponse = modelKeySummary
        ? await this.providerRouter
            .generateWithTools({
              selectedModelKey: modelKeySummary,
              messages: summaryMessages,
              tools: PENTEST_TOOL_DEFS,
              mode: 'decision',
              tool_choice: 'none',
            })
            .then((r) => ({ content: r.content }))
        : await this.llmService.generateWithTools(model, summaryMessages, PENTEST_TOOL_DEFS, {
            tool_choice: 'none',
            max_tokens: summaryCaps,
          });
      if (summaryResponse?.content?.trim()) {
        finalContent = summaryResponse.content;
      } else {
        finalContent = 'Summary of actions will appear here once the run completes.';
      }
    }

    const { thinking, final: finalReply } = this.parseThinkingAndFinal(finalContent);
    if (thinking) {
      push({ type: 'reasoning_block', data: { message: thinking } });
      // Let frontend show thinking with typing effect — Cursor-style faster (~6ms per char, cap 2.5s)
      const thinkingDelayMs = Math.min(thinking.length * 6, 2500);
      await delay(thinkingDelayMs);
    }
    push({ type: 'status', data: { message: 'Writing response...' } });
    await delay(150);
    const contentToStore = this.sanitizeFinalContent(finalReply || finalContent);
    const CHUNK_SIZE = 40;
    const DELTA_DELAY_MS = 35;
    for (let i = 0; i < contentToStore.length; i += CHUNK_SIZE) {
      push({
        type: 'message_delta',
        data: { message_id: mid, delta: contentToStore.slice(i, i + CHUNK_SIZE) },
      });
      await delay(DELTA_DELAY_MS);
    }
    push({ type: 'message_done', data: { message_id: mid } });

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Message, { id: mid }, { content: contentToStore });
      await manager.update(MessagePart, { messageId: mid }, { content: contentToStore });
    });
    await this.tryMarkMainDoneAndMaybeFinish(cid, !!emitDoneEvent, push, jobId);
    return { conversationId: cid, messageId: mid, response: contentToStore };
  }

  async setConversationRunStatus(conversationId: string | undefined, status: 'running' | 'finished' | 'error' | 'stopped'): Promise<void> {
    const cid = String(conversationId || '').trim();
    if (!cid) return;
    await this.conversationRepo.update({ id: cid }, { runStatus: status } as any);
    if (status === 'stopped' || status === 'error') {
      this.pendingFinishResolvers.get(cid)?.();
      this.pendingFinishResolvers.delete(cid);
    }
  }

  /**
   * Parse assistant content into thinking (<think>...</think>) and final (<final>...</final>).
   * If no tags, returns { thinking: '', final: content }.
   */
  private parseThinkingAndFinal(content: string): { thinking: string; final: string } {
    const raw = String(content ?? '').trim();
    let thinking = '';
    let final = raw;
    const thinkMatch = raw.match(/\s*<think>\s*([\s\S]*?)\s*<\/think\s*>/i);
    if (thinkMatch) {
      thinking = thinkMatch[1].trim();
    }
    const finalMatch = raw.match(/\s*<final\s*>([\s\S]*?)<\/final\s*>/i);
    if (finalMatch) {
      final = finalMatch[1].trim();
    } else if (thinkMatch) {
      final = raw.replace(/\s*<think>\s*[\s\S]*?\s*<\/think\s*>/i, '').trim();
    }
    return { thinking, final: final || raw };
  }

  /**
   * If the model returned DSML/function_calls markup as text, don't show it to the user.
   * Replace with a friendly message so the chat doesn't show raw internal markup.
   */
  private sanitizeFinalContent(content: string): string {
    const raw = String(content ?? '').trim();
    if (!raw) return raw;
    const looksLikeDsml =
      /<[\s\uFF5C|]*DSML[\s\uFF5C|]*>/i.test(raw) ||
      /function_calls|invoke\s+name|<\/invoke>|<\/parameter>/i.test(raw);
    if (!looksLikeDsml) return raw;
    return 'Summary of the requested checks has been completed. Review the conversation for details, or ask for a specific finding.';
  }

  /** Short preview of model text for step/activity UI (strip tags + collapse whitespace). */
  private formatAssistantTextPreview(content: string, maxLen = 160): string {
    const raw = String(content ?? '').trim();
    if (!raw) return '';
    const noTags = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/<\/?final>/gi, ' ')
      .replace(/<\/?think>/gi, ' ');
    const singleLine = noTags.replace(/\s+/g, ' ').trim();
    if (!singleLine) return '';
    return singleLine.length > maxLen ? `${singleLine.slice(0, maxLen)}...` : singleLine;
  }

  /** Extract domain/target from tool args for Hacktivity (target, url, or from command). */
  private extractDomainFromArgs(args: Record<string, any>): string | null {
    const a = args ?? {};
    const target = (a.target ?? '').toString().trim();
    if (target) return target;
    const url = (a.url ?? '').toString().trim();
    if (url) return url;
    const cmd = (a.command ?? '').toString().trim();
    if (cmd) {
      const urlLike = cmd.match(/https?:\/\/[^\s]+/);
      if (urlLike) return urlLike[0];
    }
    return null;
  }

  /** One-line description for reasoning event before each tool (Cursor-style "I will run: ..."). */
  private formatToolReasoning(name: string, args: Record<string, any>): string {
    const safeArgs = args ?? {};
    const q = (safeArgs.query ?? '').toString().trim();
    const pathVal = (safeArgs.path ?? '').toString().trim();
    const cmd = (safeArgs.command ?? '').toString().trim();
    const maxLen = 60;
    switch (name) {
      case 'memory_search':
        return q ? `Searching memory for: ${q.slice(0, maxLen)}${q.length > maxLen ? '...' : ''}` : 'Searching memory...';
      case 'memory_get':
        return pathVal ? `Reading ${pathVal}` : 'Reading file...';
      case 'write_file':
        return pathVal ? `Writing to ${pathVal}` : 'Writing...';
      case 'write_script':
        return (safeArgs.filename as string)?.trim()
          ? `Writing script: ${String(safeArgs.filename).slice(0, maxLen)}`
          : 'Writing script...';
      case 'exec':
        return cmd ? `Running: ${cmd.slice(0, maxLen)}${cmd.length > maxLen ? '...' : ''}` : 'Running command...';
      case 'craft_payload':
        return (safeArgs.script as string)?.trim()
          ? `Running payload script: ${String(safeArgs.script).slice(0, maxLen)}${String(safeArgs.script).length > maxLen ? '...' : ''}`
          : 'Running payload script...';
      case 'report_finding':
        return (safeArgs.detail as string)?.trim()
          ? `Saving finding: ${String(safeArgs.detail).slice(0, maxLen)}${String(safeArgs.detail).length > maxLen ? '...' : ''}`
          : 'Saving finding to report...';
      case 'update_pentest_phase':
        return safeArgs.phase ? `Updating phase: ${String(safeArgs.phase)}` : 'Updating pentest phase...';
      case 'add_skill':
        return (safeArgs.name as string)?.trim()
          ? `Adding skill: ${String(safeArgs.name).slice(0, maxLen)}`
          : 'Adding skill...';
      case 'download_skill':
        return (safeArgs.path as string)?.trim()
          ? `Downloading skill: ${String(safeArgs.path).slice(0, maxLen)}`
          : 'Listing skills...';
      case 'download_agent':
        return 'Downloading agent info...';
      case 'git_search':
        return (safeArgs.query as string)?.trim()
          ? `Searching GitHub: ${String(safeArgs.query).slice(0, maxLen)}`
          : 'Searching GitHub...';
      case 'agents_list':
        return 'Listing allowed agent roles...';
      case 'sessions_list':
        return 'Listing sessions...';
      case 'sessions_history':
        return safeArgs.session_id ? `Fetching history for session ${String(safeArgs.session_id).slice(0, 8)}...` : 'Fetching session history...';
      case 'sessions_send':
        return (safeArgs.message as string)?.trim()
          ? `Sending to session: ${String(safeArgs.message).slice(0, maxLen)}${String(safeArgs.message).length > maxLen ? '...' : ''}`
          : 'Sending message to session...';
      case 'sessions_spawn':
        return safeArgs.role ? `Spawning sub-agent: ${String(safeArgs.role)}` : 'Spawning sub-agent session...';
      case 'session_status':
        return safeArgs.session_id ? `Status for session ${String(safeArgs.session_id).slice(0, 8)}...` : 'Session status...';
      default:
        return `Running: ${name}`;
    }
  }

  /**
   * Run a tool. Memory is scoped by memoryScopeId (shared when sub-agents use parent's memory).
   * When sessions_send with waitForReply, forwards sub-agent events with agent_label (Agent 2, 3, ...).
   */
  private async runTool(
    name: string,
    args: Record<string, any>,
    jobId: string,
    conversationId?: string,
    userId?: string,
    pushEvent?: (ev: { type: string; data: Record<string, any> }) => void,
    memoryScopeId?: string,
    nextAgentIndexRef?: { current: number },
    abortSignal?: AbortSignal,
    modelKey?: ModelOptionKey,
    maxAgentsForRun?: number,
  ): Promise<string> {
    if (abortSignal?.aborted) {
      return JSON.stringify({ error: 'Job stopped by user' });
    }
    const safeArgs = args ?? {};
    const scopeId = memoryScopeId ?? conversationId ?? jobId;
    switch (name) {
      case 'memory_search': {
        const results = await this.toolsService.memorySearch(
          String(safeArgs.query || ''),
          Number(safeArgs.max_results) || 10,
          scopeId,
        );
        const payload: { results: any[]; hint?: string } = { results };
        if (results.length === 0) {
          payload.hint = 'No notes yet for this conversation. Use write_file (path: main or daily/website/YYYY-MM-DD, append: true) to save notes.';
        }
        return JSON.stringify(payload, null, 2);
      }
      case 'memory_get': {
        const text = await this.toolsService.memoryGet(
          String(safeArgs.path || ''),
          safeArgs.from != null ? Number(safeArgs.from) : undefined,
          safeArgs.lines != null ? Number(safeArgs.lines) : undefined,
          scopeId,
        );
        if (!text || !text.trim()) {
          return '(empty) No content for this path yet. Use write_file (path: main or daily/website/YYYY-MM-DD, append: true) to save notes.';
        }
        return text;
      }
      case 'write_file': {
        const out = await this.toolsService.writeFile(
          String(safeArgs.path || ''),
          String(safeArgs.content || ''),
          Boolean(safeArgs.append),
          scopeId,
        );
        return JSON.stringify(out);
      }
      case 'write_script': {
        const out = await this.toolsService.writeScript(
          String(safeArgs.filename || '').trim(),
          String(safeArgs.content || ''),
        );
        return JSON.stringify(out);
      }
      case 'exec': {
        const cmdLine = String(safeArgs.command || '').trim();
        const parts = cmdLine.split(/\s+/).filter(Boolean);
        const command = parts[0] || '';
        const cmdArgs = parts.slice(1);
        const target = safeArgs.target != null ? String(safeArgs.target) : undefined;
        const out = await this.toolsService.execCommand({
          command,
          args: cmdArgs.length ? cmdArgs : undefined,
          commandLine: cmdLine,
          target,
        });
        return JSON.stringify({ stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode });
      }
      case 'craft_payload': {
        const script = String(safeArgs.script ?? '').trim();
        if (!script) {
          return JSON.stringify({ error: 'craft_payload requires script (e.g. bash or python3 -c "..." )' });
        }
        const out = await this.toolsService.runPayloadScript(script);
        return JSON.stringify({ stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode });
      }
      case 'report_finding': {
        if (!userId || !conversationId) {
          return JSON.stringify({ error: 'report_finding requires an active conversation' });
        }
        const detail = String(safeArgs.detail ?? '').trim();
        if (!detail) {
          return JSON.stringify({ error: 'report_finding requires detail (description of the bug/finding)' });
        }
        const report = await this.reportsService.createFinding(userId, conversationId, detail, {
          title: safeArgs.title ? String(safeArgs.title) : undefined,
          severity: safeArgs.severity ? String(safeArgs.severity) : undefined,
          target: safeArgs.target ? String(safeArgs.target) : undefined,
          poc: safeArgs.poc ? String(safeArgs.poc) : undefined,
          finding_key: safeArgs.finding_key ? String(safeArgs.finding_key) : undefined,
        });
        return JSON.stringify({ ok: true, report_id: report.id, message: 'Finding saved to database' });
      }
      case 'update_pentest_phase': {
        if (!userId || !conversationId) {
          return JSON.stringify({ error: 'update_pentest_phase requires an active conversation' });
        }
        const convId = String(safeArgs.conversation_id ?? conversationId).trim();
        if (!convId) {
          return JSON.stringify({ error: 'conversation_id is required' });
        }
        await this.pentestJobs.updateStateByConversationId(userId, convId, {
          phase: safeArgs.phase != null ? String(safeArgs.phase) : undefined,
          checklist: safeArgs.checklist && typeof safeArgs.checklist === 'object' ? safeArgs.checklist as Record<string, boolean> : undefined,
          last_action_summary: safeArgs.last_action_summary != null ? String(safeArgs.last_action_summary) : undefined,
        });
        return JSON.stringify({ ok: true, message: 'Pentest phase updated' });
      }
      case 'add_skill': {
        const name = String(safeArgs.name ?? '').trim();
        const content = String(safeArgs.content ?? '').trim();
        const description = safeArgs.description != null ? String(safeArgs.description) : undefined;
        const out = await this.toolsService.addSkill(name, content, description);
        return JSON.stringify(out);
      }
      case 'download_skill': {
        const skillPath = safeArgs.path != null ? String(safeArgs.path).trim() : '';
        if (!skillPath) {
          const list = await this.toolsService.listSkills();
          return JSON.stringify(list);
        }
        const out = await this.toolsService.downloadSkill(skillPath);
        return JSON.stringify(out);
      }
      case 'download_agent': {
        const roles = [...ChatService.ALLOWED_AGENT_ROLES];
        const agentLabels: Record<number, string> = {};
        for (let i = 1; i <= 10; i++) {
          agentLabels[i] = getAgentLabel(i);
        }
        return JSON.stringify({
          roles,
          agent_labels: agentLabels,
          hint: 'Use sessions_spawn with role to create a sub-agent (recon, exploit, general).',
        });
      }
      case 'git_search': {
        const query = String(safeArgs.query ?? '').trim();
        const apiUrl = safeArgs.api_url != null ? String(safeArgs.api_url) : undefined;
        const out = await this.toolsService.gitSearch(query, apiUrl);
        return JSON.stringify(out);
      }
      case 'agents_list': {
        const roles = [...ChatService.ALLOWED_AGENT_ROLES];
        return JSON.stringify({ roles, hint: 'Use sessions_spawn with role to create a sub-agent (recon, exploit, general).' });
      }
      case 'sessions_list': {
        if (!userId) return JSON.stringify({ error: 'sessions_list requires an active user' });
        const list = await this.listSessions(userId, {
          parent_id: safeArgs.parent_id ? String(safeArgs.parent_id) : undefined,
          role: safeArgs.role ? String(safeArgs.role) : undefined,
          last: safeArgs.last != null ? Number(safeArgs.last) : undefined,
        });
        return JSON.stringify({ sessions: list });
      }
      case 'sessions_history': {
        const sessionId = String(safeArgs.session_id ?? '').trim();
        if (!sessionId) return JSON.stringify({ error: 'sessions_history requires session_id' });
        if (!userId) return JSON.stringify({ error: 'sessions_history requires an active user' });
        const history = await this.getSessionHistory(userId, sessionId, safeArgs.last != null ? Number(safeArgs.last) : 50);
        return JSON.stringify({ session_id: sessionId, messages: history });
      }
      case 'sessions_send': {
        const sessionId = String(safeArgs.session_id ?? '').trim();
        const msg = String(safeArgs.message ?? '').trim();
        if (!sessionId || !msg) return JSON.stringify({ error: 'sessions_send requires session_id and message' });
        if (!userId || !conversationId) return JSON.stringify({ error: 'sessions_send requires an active conversation' });
        const waitForReply = safeArgs.wait_for_reply !== false;
        const subIndex = nextAgentIndexRef ? nextAgentIndexRef.current++ : 2;
        const subLabel = getAgentLabel(subIndex);
        let onSubAgentDone: (() => Promise<void>) | undefined;
        if (!waitForReply && conversationId && pushEvent) {
          let state = this.pendingSubAgentsByParent.get(conversationId);
          if (!state) state = { mainDone: false, pending: 0 };
          state.pending++;
          this.pendingSubAgentsByParent.set(conversationId, state);
          onSubAgentDone = () => this.tryFinishParentAfterSubAgent(conversationId!, jobId, pushEvent!);
        }
        const result = await this.sendToSession(
          userId,
          conversationId,
          sessionId,
          msg,
          waitForReply,
          pushEvent ? (ev) => pushEvent({ ...ev, data: { ...ev.data, agent_index: subIndex, agent_label: subLabel } }) : undefined,
          subLabel,
          subIndex,
          scopeId,
          onSubAgentDone,
          abortSignal,
          modelKey,
        );
        return JSON.stringify(result);
      }
      case 'sessions_spawn': {
        if (!userId || !conversationId) return JSON.stringify({ error: 'sessions_spawn requires an active conversation' });
        const planIdForSpawn = await this.planResolution.getUserPlan(userId);
        const defForSpawn = this.planResolution.getPlanDefinition(planIdForSpawn);
        const planMaxSubAgents = defForSpawn.limits.max_sub_agents;
        const overrides = await this.policyOverrides.getOverrides();
        // Cap by plan and by global policy so prompt abuse cannot exceed limits.
        const baseLimit =
          planMaxSubAgents === 0
            ? 0
            : planMaxSubAgents === -1
              ? overrides.maxSubAgentsPerPlan
              : Math.min(planMaxSubAgents, overrides.maxSubAgentsPerPlan);
        const effectiveMaxSubAgents =
          maxAgentsForRun != null && maxAgentsForRun >= 0
            ? Math.min(baseLimit, maxAgentsForRun)
            : baseLimit;
        if (effectiveMaxSubAgents === 0) {
          return JSON.stringify({
            error: 'Your plan does not allow spawning sub-agents. Upgrade to Pro or higher to use multiple agents.',
          });
        }
        const existingSubs = await this.listSessions(userId, { parent_id: conversationId, last: 100 });
        if (existingSubs.length >= effectiveMaxSubAgents) {
          return JSON.stringify({
            error: `Maximum ${effectiveMaxSubAgents} sub-agent(s) for this run${maxAgentsForRun != null ? ' (scan setting)' : ''}. You have ${existingSubs.length}.`,
          });
        }
        const result = await this.spawnSession(
          userId,
          conversationId,
          safeArgs.role ? String(safeArgs.role) : undefined,
          safeArgs.title ? String(safeArgs.title) : undefined,
        );
        return JSON.stringify(result);
      }
      case 'session_status': {
        const sessionId = (safeArgs.session_id ?? conversationId) ?? '';
        if (!sessionId) return JSON.stringify({ error: 'session_status requires session_id (or current conversation)' });
        if (!userId) return JSON.stringify({ error: 'session_status requires an active user' });
        const status = await this.getSessionStatus(userId, sessionId);
        return JSON.stringify(status);
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  /**
   * Generate AI response (existing logic)
   */
  private async generateResponse(
    message: string,
    model: Model,
  ): Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const llmMessages: LlmMessage[] = [
      { role: 'system', content: PENTEST_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];

    const llmResult = await this.llmService.generate(model, llmMessages);
    if (llmResult && llmResult.content) {
      return { content: llmResult.content, usage: llmResult.usage };
    }

    const fallback = this.generateLocalResponse(message);
    return { content: fallback };
  }

  private generateLocalResponse(message: string): string {
    const lowerMessage = message.toLowerCase();

    // Check for specific security topics
    if (lowerMessage.includes('sql injection') || lowerMessage.includes('sqli')) {
      const info = this.securityKnowledge['sql injection'];
      return `**SQL Injection Vulnerability**\n\n${info.explanation}\n\n**Impact:** ${info.impact}\n\n**Remediation:** ${info.remediation}\n\nWould you like me to help you test for SQL injection vulnerabilities in your application?`;
    }

    if (lowerMessage.includes('xss') || lowerMessage.includes('cross-site scripting')) {
      const info = this.securityKnowledge['xss'];
      return `**Cross-Site Scripting (XSS)**\n\n${info.explanation}\n\n**Impact:** ${info.impact}\n\n**Remediation:** ${info.remediation}\n\nI can help you identify XSS vulnerabilities in your codebase. Would you like to proceed?`;
    }

    if (lowerMessage.includes('owasp') || lowerMessage.includes('top 10')) {
      const info = this.securityKnowledge['owasp top 10'];
      return `**OWASP Top 10**\n\n${info.explanation}\n\n**Impact:** ${info.impact}\n\n**Remediation:** ${info.remediation}\n\nI can help you assess your application against OWASP Top 10 vulnerabilities. Should I generate a comprehensive security assessment?`;
    }

    if (lowerMessage.includes('exploit') || lowerMessage.includes('vulnerability')) {
      return `I can help you recognize and analyze exploits. Common types include:\n\n� **Injection attacks** (SQL, NoSQL, Command, LDAP)\n� **Broken Authentication** (session hijacking, credential stuffing)\n� **Sensitive Data Exposure** (insecure storage, weak encryption)\n� **XML External Entities (XXE)**\n� **Broken Access Control** (unauthorized access, privilege escalation)\n� **Security Misconfiguration**\n� **Cross-Site Scripting (XSS)**\n� **Insecure Deserialization**\n� **Using Components with Known Vulnerabilities**\n� **Insufficient Logging & Monitoring**\n\nWhat specific vulnerability or exploit would you like me to analyze?`;
    }

    if (
      lowerMessage.includes('report') ||
      lowerMessage.includes('pentest') ||
      lowerMessage.includes('template')
    ) {
      return `I can generate professional pentest reports that include:\n\n**Executive Summary**\n� Risk overview and business impact\n� High-level findings and recommendations\n\n**Technical Findings**\n� Detailed vulnerability descriptions\n� Proof-of-concept exploits\n� CVSS scores and risk ratings\n� Affected systems and components\n\n**Remediation Recommendations**\n� Step-by-step fix instructions\n� Priority levels\n� Estimated effort\n\n**Compliance Mapping**\n� OWASP Top 10 alignment\n� CWE classifications\n� Compliance framework references\n\nWould you like me to generate a sample report template or analyze specific findings?`;
    }

    if (
      lowerMessage.includes('recognize') ||
      lowerMessage.includes('identify') ||
      lowerMessage.includes('detect')
    ) {
      return `I can help you recognize exploits by analyzing:\n\n**Code Patterns**\n� Unsanitized user input\n� Insecure API endpoints\n� Weak authentication mechanisms\n� Insecure direct object references\n\n**Network Indicators**\n� Unusual traffic patterns\n� Suspicious payloads\n� Port scanning activities\n� Protocol anomalies\n\n**System Behavior**\n� Unexpected file access\n� Privilege escalation attempts\n� Unauthorized data access\n� Configuration changes\n\nShare code snippets, network logs, or system configurations, and I'll help identify potential security issues.`;
    }

    // General security assistant response — keep it short and conversational
    return `Hi! I'm here to help with security — things like finding vulnerabilities, explaining attacks (SQL injection, XSS, etc.), and how to fix them. You can ask me anything: run a pentest on a URL, get step-by-step testing tips, or just chat about security. What's on your mind?`;
  }

  /**
   * Parse LLM content that may be JSON { reply, details?, followUps? }. Returns reply (or full content) and optional details/followUps.
   */
  private parseConversationJson(content: string): { reply: string; details?: string; followUps?: string[] } {
    let reply = content;
    let details: string | undefined;
    let followUps: string[] | undefined;
    try {
      const raw = content.trim();
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd)) as {
          reply?: string;
          details?: string;
          followUps?: string[];
        };
        if (parsed && typeof parsed.reply === 'string' && parsed.reply.length > 0) {
          reply = parsed.reply.trim();
          if (parsed.details != null && String(parsed.details).trim()) {
            details = String(parsed.details).trim();
          }
          if (Array.isArray(parsed.followUps) && parsed.followUps.length > 0) {
            followUps = parsed.followUps.filter((s): s is string => typeof s === 'string');
          }
        }
      }
    } catch {
      // keep reply = content
    }
    return { reply, details, followUps };
  }

  private getFixedCostPoints(model: Model): number | null {
    const raw = model?.metadata?.fixedCostPoints;
    if (raw === undefined || raw === null) {
      return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }

  private normalizePoints(amount: number): number {
    return Number(Number(amount || 0).toFixed(2));
  }

  /** Allowed agent roles for sessions_spawn (multi-agent collaboration). */
  static readonly ALLOWED_AGENT_ROLES = ['recon', 'exploit', 'general'] as const;

  /**
   * List sessions (conversations) for the user. Optional filters: parent_id, role, last.
   */
  async listSessions(
    userId: string,
    filters?: { parent_id?: string; role?: string; last?: number },
  ): Promise<Array<{ id: string; title: string | null; agentRole: string | null; parentConversationId: string | null; updatedAt: Date }>> {
    const qb = this.conversationRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.title', 'c.agentRole', 'c.parentConversationId', 'c.updatedAt'])
      .where('c.userId = :userId', { userId })
      .orderBy('c.updatedAt', 'DESC');
    if (filters?.parent_id) {
      qb.andWhere('c.parentConversationId = :parentId', { parentId: filters.parent_id });
    }
    if (filters?.role) {
      qb.andWhere('c.agentRole = :role', { role: filters.role });
    }
    const take = Math.min(Math.max(1, filters?.last ?? 20), 100);
    const list = await qb.take(take).getMany();
    return list.map((c) => ({
      id: c.id,
      title: c.title ?? null,
      agentRole: c.agentRole ?? null,
      parentConversationId: c.parentConversationId ?? null,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Get message history for a session (conversation). User must own the conversation.
   */
  async getSessionHistory(
    userId: string,
    conversationId: string,
    last: number = 50,
  ): Promise<Array<{ role: string; content: string; createdAt: Date }>> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
      relations: ['messages', 'messages.parts'],
    });
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    const messages = (conversation.messages ?? [])
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-Math.min(last, 100))
      .map((m) => ({
        role: m.role,
        content: m.content ?? '',
        createdAt: m.createdAt,
      }));
    return messages;
  }

  /**
   * Send a message to another session. If waitForReply is true, run that agent and return its reply.
   * When mainPushEvent and subAgentLabel are provided, sub-agent events are forwarded with agent_label so the UI shows "Agent 2", "Agent 3", etc.
   * When parentMemoryScope is provided, the sub-agent uses that conversation's memory (shared memory with parent).
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
    const conversation = await this.conversationRepo.findOne({
      where: { id: toConversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    if (!message || !message.trim()) {
      throw new BadRequestException('message is required');
    }
    const agentInfo =
      subAgentLabel != null && subAgentIndex != null
        ? { index: subAgentIndex, label: subAgentLabel }
        : undefined;
    const isSubAgent = (agentInfo?.index ?? 1) > 1;
    const push =
      mainPushEvent && agentInfo
        ? (ev: { type: string; data: Record<string, any> }) => {
            // Only main agent may stream text chunks to UI.
            if (
              isSubAgent &&
              (ev.type === 'message_delta' ||
                ev.type === 'message_done' ||
                ev.type === 'content' ||
                ev.type === 'content_done' ||
                ev.type === 'reasoning_block')
            ) {
              return;
            }
            mainPushEvent({
              type: ev.type,
              data: { ...ev.data, agent_index: agentInfo.index, agent_label: agentInfo.label },
            });
          }
        : mainPushEvent ?? (() => {});

    if (waitForReply) {
      const result = await this.processMessageWithTools(
        userId,
        message.trim(),
        toConversationId,
        toConversationId,
        push,
        agentInfo,
        parentMemoryScope ?? currentConversationId,
        { emitDoneEvent: false, abortSignal, ...(modelKey && { model_key: modelKey }) },
      );
      if (agentInfo) {
        push({
          type: 'status',
          data: { message: "I'm done with my work. Please continue with the next step." },
        });
      }
      return { ok: true, reply: result.response };
    }

    // wait_for_reply: false — run sub-agent in background; events still stream to main job so UI shows [Shadow], [Nexus], etc.
    await this.dataSource.transaction(async (manager) => {
      const userMsg = manager.create(Message, {
        conversationId: toConversationId,
        role: MessageRole.USER,
        content: message.trim(),
      });
      await manager.save(userMsg);
      await manager.save(
        manager.create(MessagePart, {
          messageId: userMsg.id,
          type: 'text' as any,
          content: message.trim(),
          order: 0,
        }),
      );
      const conv = await manager.findOne(Conversation, { where: { id: toConversationId } });
      if (conv) {
        conv.title = conv.title && conv.title !== 'New Conversation' ? conv.title : message.trim().slice(0, 50);
        await manager.save(conv);
      }
    });
    void this.processMessageWithTools(
      userId,
      message.trim(),
      toConversationId,
      toConversationId,
      push,
      agentInfo,
      parentMemoryScope ?? currentConversationId,
      { emitDoneEvent: false, abortSignal, ...(modelKey && { model_key: modelKey }) },
    ).then(async () => {
      if (agentInfo) {
        push({
          type: 'status',
          data: { message: "I'm done with my work. Please continue with the next step." },
        });
      }
      await onSubAgentDone?.();
    }).catch(async (err: any) => {
      if (mainPushEvent && agentInfo) {
        const raw = err?.message ?? err?.response?.message ?? String(err);
        mainPushEvent({
          type: 'error',
          data: {
            message: normalizeLlmErrorMessage(raw),
            agent_index: agentInfo.index,
            agent_label: agentInfo.label,
          },
        });
      }
      await onSubAgentDone?.();
    });
    return { ok: true, message: 'Message sent (sub-agent running in background)' };
  }

  /**
   * Spawn a new sub-agent session. Optionally set role and title.
   */
  async spawnSession(
    userId: string,
    parentConversationId: string,
    role?: string,
    title?: string,
  ): Promise<{ session_id: string; title: string; role: string | null }> {
    const parent = await this.conversationRepo.findOne({
      where: { id: parentConversationId, userId },
    });
    if (!parent) {
      throw new NotFoundException('Parent session not found');
    }
    const allowedRole = role && ChatService.ALLOWED_AGENT_ROLES.includes(role as any) ? role : null;
    const defaultModel = await this.modelRepo.findOne({
      where: { isDefault: true, isActive: true },
    });
    const modelId = defaultModel?.id ?? parent.modelId ?? null;
    const conversation = this.conversationRepo.create({
      userId,
      modelId,
      parentConversationId,
      agentRole: allowedRole,
      title: title?.trim()?.slice(0, 200) ?? (allowedRole ? `Sub-agent: ${allowedRole}` : 'New sub-agent'),
    });
    const saved = await this.conversationRepo.save(conversation);
    return {
      session_id: saved.id,
      title: saved.title ?? 'New sub-agent',
      role: saved.agentRole ?? null,
    };
  }

  /**
   * Get status for a session (current or by id): id, model, message count, last activity.
   */
  async getSessionStatus(userId: string, conversationId: string): Promise<{
    session_id: string;
    title: string | null;
    agentRole: string | null;
    messageCount: number;
    updatedAt: Date;
    modelId: string | null;
  }> {
    const id = conversationId;
    const conversation = await this.conversationRepo.findOne({
      where: { id, userId },
      relations: ['messages'],
    });
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    const messageCount = conversation.messages?.length ?? 0;
    return {
      session_id: conversation.id,
      title: conversation.title ?? null,
      agentRole: conversation.agentRole ?? null,
      messageCount,
      updatedAt: conversation.updatedAt,
      modelId: conversation.modelId ?? null,
    };
  }

  /**
   * Get user conversations (root only: exclude sub-agent sessions so sidebar shows one entry per run).
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    return await this.conversationRepo.find({
      where: { userId, parentConversationId: IsNull() },
      order: { updatedAt: 'DESC' },
      relations: ['messages'],
    });
  }

  /**
   * Get conversation detail (GET): messages + stored conversation memory from database.
   */
  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation & { memory?: Array<{ path: string; content: string }> }> {
    requireUuid(conversationId, 'conversationId');
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
      relations: ['messages', 'messages.parts'],
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const memoryRow = await this.memoryRepo.findOne({
      where: { conversationId },
    });
    const data = (memoryRow?.data ?? {}) as Record<string, string>;
    const memory = Object.entries(data).map(([path, content]) => ({ path, content }));

    return {
      ...conversation,
      memory,
    };
  }

  /**
   * Delete a conversation (and its messages via cascade)
   */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    requireUuid(conversationId, 'conversationId');
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    await this.conversationRepo.remove(conversation);
  }

  /**
   * Get available models
   */
  async getModels(): Promise<Model[]> {
    return await this.modelRepo.find({
      where: { isActive: true },
      order: { isDefault: 'DESC', displayName: 'ASC' },
    });
  }
}
