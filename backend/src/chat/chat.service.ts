import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Message, MessageRole } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { Model } from '../entities/model.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { PointsService } from '../points/points.service';
import { PointLedgerReason } from '../entities/point-ledger.entity';
import { LlmService } from '../llm/llm.service';
import { PENTEST_SYSTEM_PROMPT } from '../prompt/pentest.system-prompt';
import { PENTEST_TOOL_DEFS } from '../prompt/pentest-tools.def';
import { LlmMessage, LlmToolCall } from '../llm/llm.types';
import { ToolsService } from '../tools/tools.service';
import { ReportsService } from '../reports/reports.service';
import { getAgentLabel } from './agent-names';

/** Small delay so SSE client receives events over time and frontend typing effect can run */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    private dataSource: DataSource,
  ) {}

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
   * Get or create conversation
   */
  async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    modelId?: string,
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

    // Get default model if not specified (prefer DeepSeek when no default set)
    if (!modelId) {
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
      modelId,
      title: 'New Conversation',
    });
    return await this.conversationRepo.save(conversation);
  }

  /**
   * Process message with points deduction (ACID-safe)
   */
  async processMessage(
    userId: string,
    message: string,
    conversationId?: string,
    modelId?: string,
  ): Promise<{ response: string; conversationId: string; messageId: string }> {
    return await this.dataSource.transaction(async (manager) => {
      // Get or create conversation
      const conversation = await this.getOrCreateConversation(
        userId,
        conversationId,
        modelId,
      );

      // Get model
      const model = await manager.findOne(Model, {
        where: { id: conversation.modelId || modelId },
      });

      if (!model || !model.isActive) {
        throw new NotFoundException('Model not found or inactive');
      }

      // Calculate cost (fixed per call or token-based)
      const inputTokens = Math.ceil(message.length / 4); // Rough estimate
      const outputTokens = 500; // Estimated response tokens
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

      // Check and deduct points (ACID-safe)
      await this.pointsService.spendPoints(
        userId,
        finalCostPoints,
        PointLedgerReason.CHAT_USAGE,
        'usage_events',
        null, // Will be set after creating usage event
        { modelId: model.id, conversationId: conversation.id },
      );

      // Save user message
      const userMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      });
      await manager.save(userMessage);

      // Create message part
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

      // Save assistant message
      const assistantMessage = manager.create(Message, {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: response,
      });
      await manager.save(assistantMessage);

      // Create message part for response
      const assistantMessagePart = manager.create(MessagePart, {
        messageId: assistantMessage.id,
        type: 'text' as any,
        content: response,
        order: 0,
      });
      await manager.save(assistantMessagePart);

      // Create usage event
      const usageEvent = manager.create(UsageEvent, {
        userId,
        modelId: model.id,
        messageId: assistantMessage.id,
        inputTokens: responseInputTokens,
        outputTokens: responseOutputTokens,
        costPoints: finalCostPoints,
      });
      await manager.save(usageEvent);

      // Update conversation title if first message
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
    options?: { emitDoneEvent?: boolean },
  ): Promise<{ conversationId: string; messageId: string; response: string }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const conversation = await this.getOrCreateConversation(userId, conversationId);
      const model = await manager.findOne(Model, {
        where: { id: conversation.modelId },
      });
      if (!model || !model.isActive) {
        throw new NotFoundException('Model not found or inactive');
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

    push({ type: 'status', data: { message: 'Planning the plan...' } });

    let messages: LlmMessage[] = [
      { role: 'system', content: PENTEST_SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];

    /** No forced limit — AI can keep exploring until it naturally responds with text or hits cap. */
    const MAX_TURNS = 100;
    let turn = 0;
    let finalContent = '';

    while (turn < MAX_TURNS) {
      turn++;
      // Turn 1: require tools so the agent starts with tools. After that, model chooses tools or text freely.
      const toolChoice = turn === 1 ? ('required' as const) : undefined;

      const response = await this.llmService.generateWithTools(
        model,
        truncateMessagesForContext(messages),
        PENTEST_TOOL_DEFS,
        toolChoice ? { tool_choice: toolChoice } : undefined,
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
          let args: Record<string, any> = {};
          try {
            args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments || {};
          } catch {
            args = {};
          }

          const stepDescription = this.formatToolReasoning(tc.name, args);
          push({ type: 'status', data: { message: stepDescription } });

          let toolResult: string;
          try {
            toolResult = await this.runTool(tc.name, args, jobId, cid, userId, push, memoryScopeId, nextAgentIndexRef);
          } catch (err: any) {
            toolResult = `Error: ${err?.message || String(err)}`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: clipTextPreserveHeadTail(toolResult, MAX_CONTEXT_CHARS_PER_ROLE.tool),
          });
        }
        push({ type: 'status', data: { message: 'Planning next plan...' } });
        continue;
      }

      finalContent = response.content || '';
      break;
    }

    // If we hit MAX_TURNS without any text reply, ask the model once for a summary (no tools).
    if (!finalContent?.trim()) {
      push({ type: 'status', data: { message: 'Writing response...' } });
      const summaryMessage: LlmMessage = {
        role: 'user',
        content:
          'Summarize what you did so far. Reply only with <think>brief reasoning</think> then <final>your summary for the user</final>. No tool calls.',
      };
      const summaryResponse = await this.llmService.generateWithTools(
        model,
        truncateMessagesForContext([...messages, summaryMessage]),
        PENTEST_TOOL_DEFS,
        { tool_choice: 'none' },
      );
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
    await this.setConversationRunStatus(cid, 'finished');

    if (emitDoneEvent) {
      push({ type: 'done', data: { job_id: jobId, conversation_id: cid } });
    }
    return { conversationId: cid, messageId: mid, response: contentToStore };
  }

  async setConversationRunStatus(conversationId: string | undefined, status: 'running' | 'finished' | 'error' | 'stopped'): Promise<void> {
    const cid = String(conversationId || '').trim();
    if (!cid) return;
    await this.conversationRepo.update({ id: cid }, { runStatus: status } as any);
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

  /** One-line description for reasoning event before each tool (Cursor-style "I will run: ..."). */
  private formatToolReasoning(name: string, args: Record<string, any>): string {
    const q = (args.query ?? '').toString().trim();
    const pathVal = (args.path ?? '').toString().trim();
    const cmd = (args.command ?? '').toString().trim();
    const maxLen = 60;
    switch (name) {
      case 'memory_search':
        return q ? `Searching memory for: ${q.slice(0, maxLen)}${q.length > maxLen ? '...' : ''}` : 'Searching memory...';
      case 'memory_get':
        return pathVal ? `Reading ${pathVal}` : 'Reading file...';
      case 'write_file':
        return pathVal ? `Writing to ${pathVal}` : 'Writing...';
      case 'exec':
        return cmd ? `Running: ${cmd.slice(0, maxLen)}${cmd.length > maxLen ? '...' : ''}` : 'Running command...';
      case 'craft_payload':
        return (args.script as string)?.trim()
          ? `Running payload script: ${String(args.script).slice(0, maxLen)}${String(args.script).length > maxLen ? '...' : ''}`
          : 'Running payload script...';
      case 'report_finding':
        return (args.detail as string)?.trim()
          ? `Saving finding: ${String(args.detail).slice(0, maxLen)}${String(args.detail).length > maxLen ? '...' : ''}`
          : 'Saving finding to report...';
      case 'agents_list':
        return 'Listing allowed agent roles...';
      case 'sessions_list':
        return 'Listing sessions...';
      case 'sessions_history':
        return args.session_id ? `Fetching history for session ${String(args.session_id).slice(0, 8)}...` : 'Fetching session history...';
      case 'sessions_send':
        return (args.message as string)?.trim()
          ? `Sending to session: ${String(args.message).slice(0, maxLen)}${String(args.message).length > maxLen ? '...' : ''}`
          : 'Sending message to session...';
      case 'sessions_spawn':
        return args.role ? `Spawning sub-agent: ${String(args.role)}` : 'Spawning sub-agent session...';
      case 'session_status':
        return args.session_id ? `Status for session ${String(args.session_id).slice(0, 8)}...` : 'Session status...';
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
  ): Promise<string> {
    const scopeId = memoryScopeId ?? conversationId ?? jobId;
    switch (name) {
      case 'memory_search': {
        const results = await this.toolsService.memorySearch(
          String(args.query || ''),
          Number(args.max_results) || 10,
          scopeId,
        );
        const payload: { results: any[]; hint?: string } = { results };
        if (results.length === 0) {
          payload.hint = 'No prior notes in this conversation yet. Memory is stored in the database. Use write_file (path: main or daily/website/YYYY-MM-DD, e.g. daily/target.com/2026-02-10, append: true) to save notes.';
        }
        return JSON.stringify(payload, null, 2);
      }
      case 'memory_get': {
        const text = await this.toolsService.memoryGet(
          String(args.path || ''),
          args.from != null ? Number(args.from) : undefined,
          args.lines != null ? Number(args.lines) : undefined,
          scopeId,
        );
        if (!text || !text.trim()) {
          return '(empty) No content for this path yet. Conversation memory is in the database; use write_file (path: main or daily/website/YYYY-MM-DD) to save notes.';
        }
        return text;
      }
      case 'write_file': {
        const out = await this.toolsService.writeFile(
          String(args.path || ''),
          String(args.content || ''),
          Boolean(args.append),
          scopeId,
        );
        return JSON.stringify(out);
      }
      case 'exec': {
        const cmdLine = String(args.command || '').trim();
        const parts = cmdLine.split(/\s+/).filter(Boolean);
        const command = parts[0] || '';
        const cmdArgs = parts.slice(1);
        const target = args.target != null ? String(args.target) : undefined;
        const out = await this.toolsService.execCommand({
          command,
          args: cmdArgs.length ? cmdArgs : undefined,
          commandLine: cmdLine,
          target,
        });
        return JSON.stringify({ stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode });
      }
      case 'craft_payload': {
        const script = String(args.script ?? '').trim();
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
        const detail = String(args.detail ?? '').trim();
        if (!detail) {
          return JSON.stringify({ error: 'report_finding requires detail (description of the bug/finding)' });
        }
        const report = await this.reportsService.createFinding(userId, conversationId, detail, {
          title: args.title ? String(args.title) : undefined,
          severity: args.severity ? String(args.severity) : undefined,
          target: args.target ? String(args.target) : undefined,
          poc: args.poc ? String(args.poc) : undefined,
        });
        return JSON.stringify({ ok: true, report_id: report.id, message: 'Finding saved to database' });
      }
      case 'agents_list': {
        const roles = [...ChatService.ALLOWED_AGENT_ROLES];
        return JSON.stringify({ roles, hint: 'Use sessions_spawn with role to create a sub-agent (recon, exploit, general).' });
      }
      case 'sessions_list': {
        if (!userId) return JSON.stringify({ error: 'sessions_list requires an active user' });
        const list = await this.listSessions(userId, {
          parent_id: args.parent_id ? String(args.parent_id) : undefined,
          role: args.role ? String(args.role) : undefined,
          last: args.last != null ? Number(args.last) : undefined,
        });
        return JSON.stringify({ sessions: list });
      }
      case 'sessions_history': {
        const sessionId = String(args.session_id ?? '').trim();
        if (!sessionId) return JSON.stringify({ error: 'sessions_history requires session_id' });
        if (!userId) return JSON.stringify({ error: 'sessions_history requires an active user' });
        const history = await this.getSessionHistory(userId, sessionId, args.last != null ? Number(args.last) : 50);
        return JSON.stringify({ session_id: sessionId, messages: history });
      }
      case 'sessions_send': {
        const sessionId = String(args.session_id ?? '').trim();
        const msg = String(args.message ?? '').trim();
        if (!sessionId || !msg) return JSON.stringify({ error: 'sessions_send requires session_id and message' });
        if (!userId || !conversationId) return JSON.stringify({ error: 'sessions_send requires an active conversation' });
        const waitForReply = args.wait_for_reply !== false;
        const subIndex = nextAgentIndexRef ? nextAgentIndexRef.current++ : 2;
        const subLabel = getAgentLabel(subIndex);
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
        );
        return JSON.stringify(result);
      }
      case 'sessions_spawn': {
        if (!userId || !conversationId) return JSON.stringify({ error: 'sessions_spawn requires an active conversation' });
        const result = await this.spawnSession(
          userId,
          conversationId,
          args.role ? String(args.role) : undefined,
          args.title ? String(args.title) : undefined,
        );
        return JSON.stringify(result);
      }
      case 'session_status': {
        const sessionId = (args.session_id ?? conversationId) ?? '';
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

    // General security assistant response
    return `I'm here to help with cybersecurity and penetration testing. I can assist with:\n\n� **Exploit Recognition** - Identify and classify security vulnerabilities\n� **Vulnerability Analysis** - Analyze code, configurations, and systems\n� **Report Generation** - Create professional pentest reports\n� **Security Guidance** - Provide best practices and remediation advice\n� **Compliance** - Map findings to OWASP, CWE, NIST, and other frameworks\n\nWhat would you like to know more about? You can ask about specific vulnerabilities, request a security assessment, or get help with exploit analysis.`;
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
        { emitDoneEvent: false },
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
      { emitDoneEvent: false },
    ).then(() => {
      if (agentInfo) {
        push({
          type: 'status',
          data: { message: "I'm done with my work. Please continue with the next step." },
        });
      }
    }).catch((err: any) => {
      if (mainPushEvent && agentInfo) {
        mainPushEvent({
          type: 'error',
          data: {
            message: err?.message || String(err),
            agent_index: agentInfo.index,
            agent_label: agentInfo.label,
          },
        });
      }
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
   * Get user conversations
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    return await this.conversationRepo.find({
      where: { userId },
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
