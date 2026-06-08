/**
 * Agent Orchestrator Service
 * 
 * Handles the core agent loop — the LLM ↔ tool execution cycle.
 * Manages SSE streaming, plan enforcement, sub-agent coordination,
 * and the thinking/final content parsing.
 * Extracted from ChatService for single-responsibility.
 */

import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Message } from '../entities/message.entity';
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
import { ConversationService } from './conversation.service';
import { CostService } from './cost.service';
import { ToolExecutorService, ToolExecutionContext } from './tool-executor.service';
import { getAgentLabel } from './agent-names';
import { PlanResolutionService } from '../plans/plan-resolution.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { PolicyOverridesService } from '../plans/policy-overrides.service';
import { validateStep } from '../plans/plan-limits.validation';
import { getPlanPayload } from '../config/plans.config';
import { PentestJobsService } from '../pentest-jobs/pentest-jobs.service';
import { truncateMessagesForContext, clipTextPreserveHeadTail, MAX_CONTEXT_CHARS_PER_ROLE } from './context-manager';

/** Small delay so SSE client receives events over time and frontend typing effect can run */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class AgentOrchestratorService {
  constructor(
    private conversationService: ConversationService,
    private costService: CostService,
    private toolExecutor: ToolExecutorService,
    private llmService: LlmService,
    private providerRouter: ProviderRouterService,
    private costManager: CostManagerService,
    private planResolution: PlanResolutionService,
    private planUsage: PlanUsageService,
    private policyOverrides: PolicyOverridesService,
    @Inject(forwardRef(() => PentestJobsService))
    private pentestJobs: PentestJobsService,
    private dataSource: DataSource,
    private pointsService: PointsService,
  ) {}

  /** Tracks main-agent done + pending sub-agents per parent conversation. */
  private readonly pendingSubAgentsByParent = new Map<string, { mainDone: boolean; pending: number }>();
  /** Resolvers for callers waiting until conversation is fully finished. */
  private readonly pendingFinishResolvers = new Map<string, () => void>();

  /**
   * Mark main agent done for cid; if no pending sub-agents, set finished and push done.
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
      await this.conversationService.setConversationRunStatus(cid, 'finished');
      if (emitDoneEvent) {
        push({ type: 'done', data: { job_id: jobId, conversation_id: cid } });
      }
      return;
    }
    return new Promise<void>((resolve) => {
      this.pendingFinishResolvers.set(cid, resolve);
    });
  }

  /**
   * Called when a sub-agent completes; decrements pending and may set finished + push done.
   */
  async tryFinishParentAfterSubAgent(
    parentCid: string,
    jobId: string,
    push: (ev: { type: string; data: Record<string, any> }) => void,
  ): Promise<void> {
    const state = this.pendingSubAgentsByParent.get(parentCid);
    if (!state) return;
    state.pending = Math.max(0, state.pending - 1);
    if (state.mainDone && state.pending <= 0) {
      this.pendingSubAgentsByParent.delete(parentCid);
      const repos = this.conversationService.repos;
      const conv = await repos.conversation.findOne({ where: { id: parentCid }, select: ['runStatus'] });
      if ((conv as any)?.runStatus === 'stopped') {
        this.pendingFinishResolvers.get(parentCid)?.();
        this.pendingFinishResolvers.delete(parentCid);
        return;
      }
      await this.conversationService.setConversationRunStatus(parentCid, 'finished');
      push({ type: 'done', data: { job_id: jobId, conversation_id: parentCid } });
      this.pendingFinishResolvers.get(parentCid)?.();
      this.pendingFinishResolvers.delete(parentCid);
    } else {
      this.pendingSubAgentsByParent.set(parentCid, state);
    }
  }

  /**
   * Parse assistant content into thinking (<think>...</think>) and final (<final>...</final>).
   */
  parseThinkingAndFinal(content: string): { thinking: string; final: string } {
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
   * Sanitize final content — strip DSML/function_calls markup.
   */
  sanitizeFinalContent(content: string): string {
    const raw = String(content ?? '').trim();
    if (!raw) return raw;
    const looksLikeDsml =
      /<[\s\uFF5C|]*DSML[\s\uFF5C|]*>/i.test(raw) ||
      /function_calls|invoke\s+name|<\/invoke>|<\/parameter>/i.test(raw);
    if (!looksLikeDsml) return raw;
    return 'Summary of the requested checks has been completed. Review the conversation for details, or ask for a specific finding.';
  }

  /**
   * Short preview of model text for step/activity UI.
   */
  formatAssistantTextPreview(content: string, maxLen = 160): string {
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

  /**
   * Parse LLM content that may be JSON { reply, details?, followUps? }.
   */
  parseConversationJson(content: string): { reply: string; details?: string; followUps?: string[] } {
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

  /**
   * Core agent loop: LLM with tools → execute tool_calls → stream events → repeat until done.
   * This is the heart of the pentest engine.
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
    const useModelPicker = !!options?.model_key;
    const repos = this.conversationService.repos;

    // Save messages and get model
    const conversation = await this.conversationService.getOrCreateConversation(userId, conversationId, undefined, useModelPicker);
    let model = conversation.modelId
      ? await repos.model.findOne({ where: { id: conversation.modelId } })
      : null;
    if (!model || !model.isActive) {
      if (useModelPicker) {
        model = (await this.conversationService.getDefaultModelForUsage(null as any)) as any;
      } else {
        throw new Error(
          'Model not found or inactive. Use Auto (DeepSeek) in the model picker and ensure DEEPSEEK_API_KEY is set.',
        );
      }
    }

    // Spend points
    let usageForEvent: { modelId: string; inputTokens: number; outputTokens: number; costPoints: number } | null = null;
    if (model && model.isActive) {
      const inputTokens = Math.ceil(message.length / 4);
      const costPoints = await this.costService.spendPointsForChat(userId, model, conversation.id, inputTokens);
      usageForEvent = { modelId: model.id, inputTokens, outputTokens: 500, costPoints };
    }

    // Save user message + assistant placeholder
    const userMessage = repos.message.create({ conversationId: conversation.id, role: 'user' as any, content: message });
    await repos.message.save(userMessage);
    await repos.messagePart.save(repos.messagePart.create({ messageId: userMessage.id, type: 'text' as any, content: message, order: 0 }));

    const assistantMessage = repos.message.create({ conversationId: conversation.id, role: 'assistant' as any, content: '' });
    await repos.message.save(assistantMessage);
    await repos.messagePart.save(repos.messagePart.create({ messageId: assistantMessage.id, type: 'text' as any, content: '', order: 0 }));

    if (usageForEvent) {
      await this.costService.saveUsageEvent(null as any, userId, usageForEvent.modelId, assistantMessage.id, usageForEvent.inputTokens, usageForEvent.outputTokens, usageForEvent.costPoints);
    }

    if (conversation.title === 'New Conversation' || !conversation.title) {
      conversation.title = message.substring(0, 50);
      await repos.conversation.save(conversation);
    }

    const cid = conversation.id;
    const mid = assistantMessage.id;
    await this.conversationService.setConversationRunStatus(cid, 'running');

    const planId = await this.planResolution.getUserPlan(userId);
    const planDef = this.planResolution.getPlanDefinition(planId);
    const limits = planDef.limits;

    const push = (ev: { type: string; data: Record<string, any> }) => {
      const data = { ...ev.data };
      if (agentInfo) {
        if (data.agent_index == null) data.agent_index = agentInfo.index;
        if (data.agent_label == null) data.agent_label = agentInfo.label;
      }
      pushEvent({ type: ev.type, data });
    };

    const nextAgentIndexRef = { current: 2 };
    const memoryScopeId = memoryScopeIdOverride ?? cid;
    const emitDoneEvent = options?.emitDoneEvent !== false;
    const abortSignal = options?.abortSignal;

    push({ type: 'status', data: { message: 'Planning the plan...' } });

    // Load prior messages
    const priorMessages = await this.conversationService.getPriorMessages(cid, 2);
    const priorLlm: LlmMessage[] = priorMessages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content ?? '',
    }));

    let messages: LlmMessage[] = [
      { role: 'system', content: PENTEST_SYSTEM_PROMPT },
      ...priorLlm,
      { role: 'user', content: message },
    ];

    const MAX_TURNS = 100;
    let turn = 0;
    let finalContent = '';
    let lastStepAt = 0;
    let stepLimitReached = false;

    while (turn < MAX_TURNS) {
      if (abortSignal?.aborted) throw new Error('Request was cancelled');
      turn++;

      // Plan enforcement
      try {
        validateStep(planId, limits, { stepNumber: turn, lastStepAtMs: lastStepAt });
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
        push({ type: 'plan_info', data: { plan: payload.plan, limits_summary: payload.limits_summary, usage } });
      }

      lastStepAt = Date.now();
      const toolChoice = turn === 1 ? ('required' as const) : undefined;
      const modelKey = options?.model_key || 'auto';

      const toolsCap = this.costManager.getToolsOutputCap();
      const fallbackCaps = this.costManager.getCaps('auto', 'decision');
      const maxTokensForTools = toolsCap ?? fallbackCaps.maxOutputTokens;
      const response = modelKey
        ? await this.providerRouter
            .generateWithTools({
              selectedModelKey: modelKey,
              selectedModelIdOverride: options?.modelIdOverride,
              messages: truncateMessagesForContext(messages),
              tools: PENTEST_TOOL_DEFS,
              mode: 'decision',
              tool_choice: toolChoice,
            })
            .then((r) => ({ content: r.content, tool_calls: r.tool_calls }))
        : await this.llmService.generateWithTools(
            model!,
            truncateMessagesForContext(messages),
            PENTEST_TOOL_DEFS,
            { tool_choice: toolChoice, max_tokens: maxTokensForTools },
          );
      if (!response) {
        finalContent = this.generateLocalResponse(message);
        break;
      }

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
          if (abortSignal?.aborted) throw new Error('Request was cancelled');
          let args: Record<string, any> = {};
          try {
            const parsed = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments;
            args = parsed && typeof parsed === 'object' ? parsed : {};
          } catch { args = {}; }

          const stepDescription = this.toolExecutor.formatToolReasoning(tc.name, args);
          push({ type: 'status', data: { message: stepDescription } });

          let toolResult: string;
          try {
            // Handle sessions_send delegation inline (needs access to this orchestrator)
            if (tc.name === 'sessions_send') {
              toolResult = await this.handleSessionsSendTool(args, userId, cid, jobId, pushEvent, nextAgentIndexRef, memoryScopeId, abortSignal, options?.model_key, options?.maxAgentsForRun);
            } else {
              const context: ToolExecutionContext = {
                jobId,
                conversationId: cid,
                userId,
                memoryScopeId,
                nextAgentIndexRef,
                pushEvent: push,
                abortSignal,
                modelKey: options?.model_key,
                maxAgentsForRun: options?.maxAgentsForRun,
              };
              toolResult = await this.toolExecutor.runTool(tc.name, args, context);
            }
          } catch (err: any) {
            toolResult = `Error: ${err?.message || String(err)}`;
          }

          await this.toolExecutor.logToolExecution(userId, cid, args, toolResult);

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: clipTextPreserveHeadTail(toolResult, MAX_CONTEXT_CHARS_PER_ROLE.tool),
          });
          push({
            type: 'tool_log',
            data: { tool: tc.name, output: clipTextPreserveHeadTail(toolResult, 4000) },
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

    // Summary if no text reply
    const modelKeySummary = options?.model_key || 'auto';
    if (!finalContent?.trim()) {
      push({ type: 'status', data: { message: 'Writing response...' } });
      const summaryPrompt = stepLimitReached
        ? 'Step limit for this session was reached. Summarize what you found so far (list each report_finding). In <final>, also list which checklist areas you did NOT get to test (e.g. XSS, LFI, auth) so the user knows. Reply only with <think>brief</think> then <final>summary + unchecked areas</final>. No tool calls.'
        : 'Summarize what you did so far. Reply only with <think>brief reasoning</think> then <final>your summary for the user</final>. No tool calls.';
      const summaryMessage: LlmMessage = { role: 'user', content: summaryPrompt };
      const summaryMessages = truncateMessagesForContext([...messages, summaryMessage]);
      const summaryCaps = this.costManager.getToolsOutputCap() ?? this.costManager.getCaps('auto', 'decision').maxOutputTokens;
      const summaryResponse = modelKeySummary
        ? await this.providerRouter
            .generateWithTools({
              selectedModelKey: modelKeySummary,
              selectedModelIdOverride: options?.modelIdOverride,
              messages: summaryMessages,
              tools: PENTEST_TOOL_DEFS,
              mode: 'decision',
              tool_choice: 'none',
            })
            .then((r) => ({ content: r.content }))
        : await this.llmService.generateWithTools(model!, summaryMessages, PENTEST_TOOL_DEFS, {
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
      const thinkingDelayMs = Math.min(thinking.length * 6, 2500);
      await delay(thinkingDelayMs);
    }
    push({ type: 'status', data: { message: 'Writing response...' } });
    await delay(150);
    const contentToStore = this.sanitizeFinalContent(finalReply || finalContent);
    const CHUNK_SIZE = 40;
    const DELTA_DELAY_MS = 35;
    for (let i = 0; i < contentToStore.length; i += CHUNK_SIZE) {
      push({ type: 'message_delta', data: { message_id: mid, delta: contentToStore.slice(i, i + CHUNK_SIZE) } });
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

  /**
   * Handle sessions_send tool — needs orchestrator access for sub-agent coordination.
   */
  private async handleSessionsSendTool(
    args: Record<string, any>,
    userId: string,
    currentConversationId: string,
    jobId: string,
    pushEvent: (ev: { type: string; data: Record<string, any> }) => void,
    nextAgentIndexRef: { current: number },
    memoryScopeId: string,
    abortSignal?: AbortSignal,
    modelKey?: ModelOptionKey,
    maxAgentsForRun?: number,
  ): Promise<string> {
    const sessionId = String(args.session_id ?? '').trim();
    const msg = String(args.message ?? '').trim();
    if (!sessionId || !msg) return JSON.stringify({ error: 'sessions_send requires session_id and message' });

    const waitForReply = args.wait_for_reply !== false;
    const subIndex = nextAgentIndexRef ? nextAgentIndexRef.current++ : 2;
    const subLabel = getAgentLabel(subIndex);

    const agentInfo = { index: subIndex, label: subLabel };
    const isSubAgent = agentInfo.index > 1;
    const push = (ev: { type: string; data: Record<string, any> }) => {
      const data = { ...ev.data };
      if (isSubAgent && (ev.type === 'message_delta' || ev.type === 'message_done' || ev.type === 'content' || ev.type === 'content_done' || ev.type === 'reasoning_block')) {
        return;
      }
      data.agent_index = agentInfo.index;
      data.agent_label = agentInfo.label;
      pushEvent({ type: ev.type, data });
    };

    if (waitForReply) {
      const result = await this.processMessageWithTools(
        userId, msg.trim(), sessionId, sessionId, push, agentInfo,
        memoryScopeId, { emitDoneEvent: false, abortSignal, ...(modelKey && { model_key: modelKey }) },
      );
      push({ type: 'status', data: { message: "I'm done with my work. Please continue with the next step." } });
      return JSON.stringify({ ok: true, reply: result.response });
    }

    // Background sub-agent
    await this.conversationService.saveUserMessage(sessionId, msg.trim());

    let onSubAgentDone: (() => Promise<void>) | undefined;
    if (currentConversationId) {
      let state = this.pendingSubAgentsByParent.get(currentConversationId);
      if (!state) state = { mainDone: false, pending: 0 };
      state.pending++;
      this.pendingSubAgentsByParent.set(currentConversationId, state);
      onSubAgentDone = () => this.tryFinishParentAfterSubAgent(currentConversationId, jobId, pushEvent);
    }

    void this.processMessageWithTools(
      userId, msg.trim(), sessionId, sessionId, push, agentInfo,
      memoryScopeId, { emitDoneEvent: false, abortSignal, ...(modelKey && { model_key: modelKey }) },
    ).then(async () => {
      push({ type: 'status', data: { message: "I'm done with my work. Please continue with the next step." } });
      await onSubAgentDone?.();
    }).catch(async (err: any) => {
      if (pushEvent && agentInfo) {
        const raw = err?.message ?? err?.response?.message ?? String(err);
        pushEvent({
          type: 'error',
          data: { message: normalizeLlmErrorMessage(raw), agent_index: agentInfo.index, agent_label: agentInfo.label },
        });
      }
      await onSubAgentDone?.();
    });

    return JSON.stringify({ ok: true, message: 'Message sent (sub-agent running in background)' });
  }

  /**
   * Generate local fallback response when LLM is unavailable.
   */
  private generateLocalResponse(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('sql injection') || lowerMessage.includes('sqli')) {
      return `**SQL Injection Vulnerability**\n\nSQL Injection is a code injection technique that exploits security vulnerabilities in an application's database layer.\n\n**Impact:** High - Can lead to unauthorized data access, data manipulation, or complete database compromise.\n\n**Remediation:** Use parameterized queries, input validation, least privilege database accounts, and Web Application Firewalls (WAF).\n\nWould you like me to help you test for SQL injection vulnerabilities in your application?`;
    }

    if (lowerMessage.includes('xss') || lowerMessage.includes('cross-site scripting')) {
      return `**Cross-Site Scripting (XSS)**\n\nXSS allows attackers to inject malicious scripts into web pages viewed by other users.\n\n**Impact:** Medium to High - Can steal session tokens, credentials, or perform actions on behalf of users.\n\n**Remediation:** Implement Content Security Policy (CSP), sanitize user input, use output encoding, and validate all user-supplied data.\n\nI can help you identify XSS vulnerabilities in your codebase. Would you like to proceed?`;
    }

    if (lowerMessage.includes('owasp') || lowerMessage.includes('top 10')) {
      return `**OWASP Top 10**\n\nThe OWASP Top 10 is a standard awareness document representing the most critical security risks to web applications.\n\n**Impact:** Varies by vulnerability type.\n\n**Remediation:** Follow OWASP guidelines, implement secure coding practices, and conduct regular security assessments.\n\nI can help you assess your application against OWASP Top 10 vulnerabilities. Should I generate a comprehensive security assessment?`;
    }

    return `Hi! I'm here to help with security — things like finding vulnerabilities, explaining attacks (SQL injection, XSS, etc.), and how to fix them. You can ask me anything: run a pentest on a URL, get step-by-step testing tips, or just chat about security. What's on your mind?`;
  }
}
