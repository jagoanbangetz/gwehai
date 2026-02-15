import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatService } from '../chat/chat.service';
import { getAgentLabel } from '../chat/agent-names';
import { PENTEST_SYSTEM_PROMPT } from '../prompt/pentest.system-prompt';
import { PlanResolutionService } from '../plans/plan-resolution.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { validateScanStart } from '../plans/plan-limits.validation';
import { getPlanPayload } from '../config/plans.config';
import type { PlanId } from '../config/plans.config';
import { WORKER_SLOT_TTL_MS } from '../config/plan-billing.config';

/** In-memory worker slot with TTL. TODO: replace with Redis SETNX lock when Redis is available. */
interface WorkerSlot {
  jobId: string;
  expiresAt: number;
}

@Injectable()
export class GwehAIService {
  private readonly jobs = new Map<string, LocalAIJob>();
  /** In-memory per-user worker slots (jobId + expiresAt). Expired slots are pruned on check. */
  private readonly workerSlots = new Map<string, WorkerSlot[]>();

  constructor(
    private readonly chatService: ChatService,
    private readonly planResolution: PlanResolutionService,
    private readonly planUsage: PlanUsageService,
  ) {}

  /**
   * Create a local chat job and persist the conversation
   */
  async createJob(
    userId: string,
    messages: Array<{ role: string; content: string }>,
    stream: boolean = false,
    conversationId?: string,
  ): Promise<any> {
    const payload = {
      messages,
      stream,
      conversation_id: conversationId,
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

    // Enforce workers concurrency (in-memory with TTL; TODO: Redis SETNX when available)
    const now = Date.now();
    let slots = this.workerSlots.get(userId) ?? [];
    slots = slots.filter((s) => s.expiresAt > now);
    this.workerSlots.set(userId, slots);
    const sessionsToday = await this.planUsage.getSessionsStartedToday(userId);
    validateScanStart(planId, limits, {
      currentWorkerCount: slots.length,
      sessionsStartedToday: sessionsToday,
    });
    await this.planUsage.recordSessionStart(userId);

    const jobId = randomUUID();
    slots = this.workerSlots.get(userId) ?? [];
    slots.push({ jobId, expiresAt: now + WORKER_SLOT_TTL_MS });
    this.workerSlots.set(userId, slots);

    const releaseWorker = () => {
      const list = this.workerSlots.get(userId) ?? [];
      this.workerSlots.set(userId, list.filter((s) => s.jobId !== jobId));
    };

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

    // Run agent in background: LLM → append events to job.events; stream endpoint polls and yields SSE.
    this.runAgentInBackground(jobId, userId, message, conversationId)
      .catch((err) => {
        const job = this.jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = err?.message || String(err);
          job.events.push({ type: 'error', data: { message: job.error } });
          job.events.push({ type: 'done', data: { job_id: jobId, conversation_id: job.conversationId } });
          this.chatService.setConversationRunStatus(job.conversationId || conversationId, 'error').catch(() => {});
        }
      })
      .finally(releaseWorker);

    const planPayload = getPlanPayload(planId);
    const usage = await this.planUsage.getUsage(userId, planId, undefined);

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
      const result = useSimple
        ? await this.chatService.processMessageSimple(
            userId,
            message,
            conversationId,
            jobId,
            pushEvent,
            { emitDoneEvent: true, abortSignal },
          )
        : await this.chatService.processMessageWithTools(
            userId,
            message,
            conversationId,
            jobId,
            pushEvent,
            { index: 1, label: getAgentLabel(1) },
            undefined,
            { emitDoneEvent: true, abortSignal },
          );

      job.conversationId = result.conversationId;
      job.messageId = result.messageId;
      job.response = result.response || '';
      job.status = 'completed';
      job.updatedAt = Date.now();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isContextLength =
        /maximum context length|context length|requested.*tokens|reduce the length of the messages|conversation is too long/i.test(errMsg);
      const isAborted =
        /\baborted\b|aborterror|request aborted|stream has been aborted|request stream has been aborted|canceled|cancelled/i.test(errMsg);
      const friendlyMessage = isContextLength
        ? 'Conversation is too long for the model. Please start a new chat or ask a shorter question.'
        : isAborted
          ? 'Request was cancelled before completion. Please run again.'
          : errMsg;
      pushEvent({ type: 'status', data: { message: `Error: ${friendlyMessage}` } });
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
    }
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
   * Stop a running job
   */
  async stopJob(jobId: string, userId?: string): Promise<any> {
    const job = this.getJob(jobId, userId);
    job.status = 'stopped';
    job.updatedAt = Date.now();
    job.abortController?.abort();
    await this.chatService.setConversationRunStatus(job.conversationId, 'stopped');
    return { job_id: job.id, status: job.status };
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
