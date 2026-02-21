import { Injectable, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatService } from '../chat/chat.service';
import { getAgentLabel } from '../chat/agent-names';
import { PENTEST_SYSTEM_PROMPT } from '../prompt/pentest.system-prompt';
import { PlanResolutionService } from '../plans/plan-resolution.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { PolicyOverridesService } from '../plans/policy-overrides.service';
import { validateScanStart } from '../plans/plan-limits.validation';
import { getPlanPayload } from '../config/plans.config';
import type { PlanId } from '../config/plans.config';
import { JobsEventsService } from './jobs-events.service';
import { PentestJobsService } from '../pentest-jobs/pentest-jobs.service';
import { normalizeLlmErrorMessage } from '../llm/provider-router.service';

@Injectable()
export class GwehAIService {
  private readonly jobs = new Map<string, LocalAIJob>();
  /** Number of active SSE stream connections per job. When this goes to 0 for a running job, we stop the job to avoid background AI cost. */
  private readonly streamConnectionCounts = new Map<string, number>();
  /** Worker slots are in PlanUsageService (shared with pentest-jobs so limits cannot be bypassed). */

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly planResolution: PlanResolutionService,
    private readonly planUsage: PlanUsageService,
    private readonly policyOverrides: PolicyOverridesService,
    private readonly jobsEvents: JobsEventsService,
    @Inject(forwardRef(() => PentestJobsService))
    private readonly pentestJobs: PentestJobsService,
  ) {}

  /**
   * Create a local chat job and persist the conversation
   */
  async createJob(
    userId: string,
    messages: Array<{ role: string; content: string }>,
    stream: boolean = false,
    conversationId?: string,
    modelKey?: 'auto' | 'deepseek' | 'openai_gpt5' | 'claude',
  ): Promise<any> {
    const payload = {
      messages,
      stream,
      conversation_id: conversationId,
      ...(modelKey && { model_key: modelKey }),
    };
    return this.startChat(userId, payload);
  }

  /**
   * New-style chat API (self-hosted).
   * Creates a job, starts the agent loop in the background, returns immediately.
   * Client uses stream_id to open GET /api/gwehai/chat/stream?stream_id=... and polls job.events.
   */
  async startChat(userId: string, payload: any): Promise<any> {
    const message = this.extractUserMessage(payload);
    const conversationId = payload.conversation_id;

    const planId: PlanId = await this.planResolution.getUserPlan(userId);
    const def = this.planResolution.getPlanDefinition(planId);
    const limits = def.limits;
    const overrides = await this.policyOverrides.getOverrides();
    const effectiveWorkers = Math.min(limits.workers, overrides.maxParallelJobsPerPlan);

    const sessionsToday = await this.planUsage.getSessionsStartedToday(userId);
    const currentWorkerCount = this.planUsage.getActiveWorkerCount(userId);
    validateScanStart(planId, { ...limits, workers: effectiveWorkers }, {
      currentWorkerCount,
      sessionsStartedToday: sessionsToday,
    });
    await this.planUsage.recordSessionStart(userId);
    const { release: releaseWorker } = this.planUsage.reserveWorkerSlot(userId, effectiveWorkers);

    const jobId = randomUUID();
    const now = Date.now();

    const job: LocalAIJob = {
      id: jobId,
      userId,
      conversationId: '',
      messageId: '',
      response: '',
      status: 'running',
      createdAt: now,
      updatedAt: now,
      systemPrompt: PENTEST_SYSTEM_PROMPT,
      userMessage: message,
      events: [],
      abortController: new AbortController(),
    };

    this.jobs.set(jobId, job);

    // Auto = DeepSeek. Always use a model key (default 'auto') so we never hit "Model not found".
    const modelKey: 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' =
      payload.model_key && ['auto', 'deepseek', 'openai_gpt5', 'claude'].includes(payload.model_key)
        ? payload.model_key
        : 'auto';
    if (modelKey) {
      console.log('[gwehai] using model picker:', modelKey, modelKey === 'auto' ? '(DeepSeek)' : '');
    }
    // Run agent in background: LLM → append events to job.events; stream endpoint polls and yields SSE.
    this.runAgentInBackground(jobId, userId, message, conversationId, modelKey)
      .catch((err) => {
        const job = this.jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          const raw = err?.message ?? err?.response?.message ?? String(err);
          job.error = normalizeLlmErrorMessage(raw);
          job.events.push({ type: 'error', data: { message: job.error } });
          job.events.push({ type: 'done', data: { job_id: jobId, conversation_id: job.conversationId } });
          this.chatService.setConversationRunStatus(job.conversationId || conversationId, 'error').catch(() => {});
          this.jobsEvents.emitJobListUpdate(userId);
        }
      })
      .finally(releaseWorker);

    const planPayload = getPlanPayload(planId);
    const usage = await this.planUsage.getUsage(userId, planId, undefined);

    this.jobsEvents.emitJobListUpdate(userId);

    return {
      job_id: jobId,
      stream_id: jobId,
      conversation_id: undefined,
      status: job.status,
      message: 'Job created',
      plan: planPayload.plan,
      limits_summary: planPayload.limits_summary,
      usage,
    };
  }

  /**
   * True if the user message indicates a target host (URL or "pentest <host>"). Otherwise we use simple security Q&A.
   */
  private looksLikeTargetRequest(message: string): boolean {
    const trimmed = message.trim();
    if (/https?:\/\//i.test(trimmed)) return true;
    if (/pentest\s+\S+/i.test(trimmed)) return true;
    return false;
  }

  /** Extract target URL from user message for PentestJob (e.g. "pentest https://example.com" or plain URL). */
  private extractTargetFromMessage(message: string): string {
    const trimmed = message.trim();
    const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>)\]]+/i);
    if (urlMatch) return urlMatch[0].replace(/[)\]\s,]+$/, '');
    const pentestMatch = trimmed.match(/pentest\s+(\S+)/i);
    if (pentestMatch) {
      const target = pentestMatch[1];
      return /^https?:\/\//i.test(target) ? target : `https://${target}`;
    }
    return '';
  }

  /**
   * Agent loop (background): if no target host, use processMessageSimple (direct security Q&A); otherwise processMessageWithTools.
   * Events (status, message_delta, message_done, done) or full tool events are pushed to job.events;
   * stream endpoint polls and yields SSE so the user sees what the agent is doing step by step.
   */
  private async runAgentInBackground(
    jobId: string,
    userId: string,
    message: string,
    conversationId?: string,
    modelKey?: 'auto' | 'deepseek' | 'openai_gpt5' | 'claude',
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'stopped') return;
    if (conversationId) {
      await this.chatService.setConversationRunStatus(conversationId, 'running');
    }

    const pushEvent = (ev: JobStreamEvent) => {
      const j = this.jobs.get(jobId);
      if (j) j.events.push(ev);
    };

    const abortSignal = job.abortController?.signal;

    try {
      const useSimple = !this.looksLikeTargetRequest(message);
      const chatOptions = { emitDoneEvent: true, abortSignal, ...(modelKey && { model_key: modelKey }) };
      const result = useSimple
        ? await this.chatService.processMessageSimple(
            userId,
            message,
            conversationId,
            jobId,
            pushEvent,
            chatOptions,
          )
        : await this.chatService.processMessageWithTools(
            userId,
            message,
            conversationId,
            jobId,
            pushEvent,
            { index: 1, label: getAgentLabel(1) },
            undefined,
            chatOptions,
          );

      job.conversationId = result.conversationId;
      job.messageId = result.messageId;
      job.response = result.response || '';
      job.status = 'completed';
      job.updatedAt = Date.now();
      if (!useSimple && result.conversationId) {
        try {
          await this.pentestJobs.ensureJobForConversation(
            userId,
            result.conversationId,
            this.extractTargetFromMessage(message),
            modelKey,
          );
        } catch (e) {
          // non-fatal: phase display may stay default
        }
        try {
          await this.pentestJobs.updateJobStatusByConversationId(userId, result.conversationId, 'done');
        } catch (e) {
          // non-fatal: pentest job may not exist for this conversation
        }
      }
      this.jobsEvents.emitJobListUpdate(userId);
    } catch (err: any) {
      const errMsg = err?.message ?? err?.response?.message ?? String(err);
      const isContextLength =
        /maximum context length|context length|requested.*tokens|reduce the length of the messages|conversation is too long/i.test(errMsg);
      const isAborted =
        /\baborted\b|aborterror|request aborted|stream has been aborted|request stream has been aborted|canceled|cancelled/i.test(errMsg);
      const friendlyMessage = isContextLength
        ? 'Conversation is too long for the model. Please start a new chat or ask a shorter question.'
        : isAborted
          ? 'Request was cancelled before completion. Please run again.'
          : normalizeLlmErrorMessage(errMsg);
      pushEvent({ type: 'status', data: { message: 'An error occurred.' } });
      pushEvent({
        type: 'error',
        data: {
          message: friendlyMessage,
          ...(isContextLength ? { error_code: 'context_too_long' } : {}),
          ...(isAborted ? { error_code: 'request_aborted' } : {}),
        },
      });
      pushEvent({ type: 'done', data: { job_id: jobId, conversation_id: job.conversationId || conversationId } });
      job.status = 'completed';
      job.response = friendlyMessage;
      job.updatedAt = Date.now();
      await this.chatService.setConversationRunStatus(job.conversationId || conversationId, 'error');
      const cid = job.conversationId || conversationId;
      if (cid) {
        try {
          await this.pentestJobs.updateJobStatusByConversationId(userId, cid, 'failed');
        } catch (e) {
          // non-fatal
        }
      }
      this.jobsEvents.emitJobListUpdate(userId);
    }
  }

  /** Max jobs to return per user (avoids huge lists and "no activity" for old jobs). */
  private static readonly MAX_JOBS_PER_USER = 50;
  /** Remove completed/stopped jobs older than this (ms) so we don't keep working on dead jobs. */
  private static readonly PRUNE_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
  /** Keep at least this many jobs per user when pruning. */
  private static readonly MIN_JOBS_KEEP = 20;

  /**
   * Remove old completed/stopped jobs for a user so the list doesn't grow forever and streams don't sit on dead jobs.
   */
  private pruneOldJobsForUser(userId: string): void {
    const now = Date.now();
    const userJobs = Array.from(this.jobs.entries())
      .filter(([, j]) => j.userId === userId)
      .sort(([, a], [, b]) => b.createdAt - a.createdAt);
    if (userJobs.length <= GwehAIService.MIN_JOBS_KEEP) return;
    const toRemove = userJobs
      .slice(GwehAIService.MIN_JOBS_KEEP)
      .filter(([, j]) => {
        const isDone = j.status === 'completed' || j.status === 'stopped' || j.status === 'failed';
        const old = now - (j.updatedAt ?? j.createdAt) > GwehAIService.PRUNE_AGE_MS;
        return isDone && old;
      })
      .map(([id]) => id);
    toRemove.forEach((id) => {
      this.jobs.delete(id);
      this.streamConnectionCounts.delete(id);
    });
  }

  /**
   * List jobs for the current user (running first, then by createdAt desc).
   * Used by Current Pentest modal. Limited to MAX_JOBS_PER_USER; old completed jobs are pruned.
   */
  listJobsForUser(userId: string): Array<{
    job_id: string;
    status: string;
    user_message: string;
    conversation_id: string | undefined;
    createdAt: number;
  }> {
    this.pruneOldJobsForUser(userId);
    const list: Array<{
      job_id: string;
      status: string;
      user_message: string;
      conversation_id: string | undefined;
      createdAt: number;
    }> = [];
    this.jobs.forEach((job) => {
      if (job.userId !== userId) return;
      list.push({
        job_id: job.id,
        status: job.status,
        user_message: (job.userMessage || '').slice(0, 300),
        conversation_id: job.conversationId || undefined,
        createdAt: job.createdAt,
      });
    });
    list.sort((a, b) => {
      const runningA = a.status === 'running' ? 1 : 0;
      const runningB = b.status === 'running' ? 1 : 0;
      if (runningA !== runningB) return runningB - runningA;
      return b.createdAt - a.createdAt;
    });
    return list.slice(0, GwehAIService.MAX_JOBS_PER_USER);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string, userId?: string): Promise<any> {
    const job = this.getJob(jobId, userId);
    return {
      job_id: job.id,
      status: job.status,
      user_message: job.userMessage,
      conversation_id: job.conversationId || undefined,
    };
  }

  /**
   * Stop a running job (abort agent loop so no more AI requests; saves cost).
   */
  async stopJob(jobId: string, userId?: string): Promise<any> {
    const job = this.getJob(jobId, userId);
    if (job.status !== 'running' && job.status !== 'ready') return { job_id: job.id, status: job.status };
    job.status = 'stopped';
    job.updatedAt = Date.now();
    job.abortController?.abort();
    await this.chatService.setConversationRunStatus(job.conversationId, 'stopped');
    if (job.conversationId) {
      try {
        await this.pentestJobs.updateJobStatusByConversationId(job.userId, job.conversationId, 'failed');
      } catch (e) {
        // non-fatal
      }
    }
    this.jobsEvents.emitJobListUpdate(job.userId);
    return { job_id: job.id, status: job.status };
  }

  /**
   * Called when a client opens an SSE stream for a job. Only stop the job when the last client disconnects.
   */
  incrementStreamConnections(jobId: string): number {
    const n = (this.streamConnectionCounts.get(jobId) ?? 0) + 1;
    this.streamConnectionCounts.set(jobId, n);
    return n;
  }

  /**
   * Called when a client closes the SSE stream. We only update the connection count.
   * We do NOT stop the job when the last client disconnects, so that starting another target
   * (which closes the previous stream) does not stop the previous scan. Jobs are stopped only
   * when the user explicitly stops or when the job completes/fails.
   */
  async decrementStreamConnections(jobId: string, _userId?: string): Promise<void> {
    const n = Math.max(0, (this.streamConnectionCounts.get(jobId) ?? 1) - 1);
    if (n === 0) this.streamConnectionCounts.delete(jobId);
    else this.streamConnectionCounts.set(jobId, n);
  }

  /**
   * Continue/Resume a job
   */
  async continueJob(jobId: string, userId?: string): Promise<any> {
    const job = this.getJob(jobId, userId);
    if (job.status === 'stopped') {
      job.status = 'ready';
      job.updatedAt = Date.now();
    }
    return { job_id: job.id, status: job.status };
  }

  /**
   * Get job for streaming or inspection
   */
  getJob(streamId: string, userId?: string): LocalAIJob {
    const job = this.jobs.get(streamId);
    if (!job) {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }
    if (userId && job.userId !== userId) {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }
    return job;
  }

  /**
   * Register a pentest run as a live job so it appears in ops-console and can be stopped via stopJob.
   * Returns the job's abort signal to pass to ChatService.processMessageWithTools.
   */
  registerPentestJob(
    pentestJobId: string,
    userId: string,
    conversationId: string,
    userMessage: string,
  ): AbortSignal {
    const now = Date.now();
    const job: LocalAIJob = {
      id: pentestJobId,
      userId,
      conversationId,
      messageId: '',
      response: '',
      status: 'running',
      createdAt: now,
      updatedAt: now,
      systemPrompt: PENTEST_SYSTEM_PROMPT,
      userMessage: (userMessage || '').slice(0, 500),
      events: [],
      abortController: new AbortController(),
    };
    this.jobs.set(pentestJobId, job);
    return job.abortController!.signal;
  }

  /**
   * Admin-only: snapshot of all in-memory jobs (active and recent) for monitoring.
   */
  getActiveJobsForAdmin(): Array<{
    job_id: string;
    userId: string;
    conversationId: string;
    status: string;
    createdAt: number;
    userMessage: string;
  }> {
    const list: Array<{
      job_id: string;
      userId: string;
      conversationId: string;
      status: string;
      createdAt: number;
      userMessage: string;
    }> = [];
    this.jobs.forEach((job) => {
      list.push({
        job_id: job.id,
        userId: job.userId,
        conversationId: job.conversationId || '',
        status: job.status,
        createdAt: job.createdAt,
        userMessage: (job.userMessage || '').slice(0, 200),
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  updateJobStatus(streamId: string, status: LocalAIJobStatus, error?: string) {
    const job = this.jobs.get(streamId);
    if (!job) {
      return;
    }
    job.status = status;
    job.updatedAt = Date.now();
    if (error) {
      job.error = error;
    }
  }

  private extractUserMessage(payload: any): string {
    if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
      const lastUserMessage = payload.messages
        .slice()
        .reverse()
        .find((m: any) => m.role === 'user');
      const messageToSend = lastUserMessage || payload.messages[0];
      const message = messageToSend?.content || '';
      if (!message) {
        throw new HttpException('Message content is required', HttpStatus.BAD_REQUEST);
      }
      return message;
    }

    if (payload.message) {
      return payload.message;
    }

    throw new HttpException(
      'Either "messages" array or "message" string is required',
      HttpStatus.BAD_REQUEST,
    );
  }
}

type LocalAIJobStatus = 'ready' | 'running' | 'completed' | 'failed' | 'stopped';

export interface JobStreamEvent {
  type: string;
  data: Record<string, any>;
}

interface LocalAIJob {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  response: string;
  status: LocalAIJobStatus;
  createdAt: number;
  updatedAt: number;
  systemPrompt: string;
  userMessage: string;
  error?: string;
  /** Events appended by the agent; stream endpoint polls and yields SSE */
  events: JobStreamEvent[];
  /** When aborted, main and all sub-agents stop scanning */
  abortController?: AbortController;
}
