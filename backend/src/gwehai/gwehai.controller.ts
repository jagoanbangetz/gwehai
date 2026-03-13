import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GwehAIService } from './gwehai.service';
import { normalizeLlmErrorMessage } from '../llm/provider-router.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GwehAISSEGuard } from './gwehai-sse.guard';
import { getModelOptions } from '../config/model-options.config';
import { Model } from '../entities/model.entity';

interface ChatCompletionRequest {
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  job_id?: string;
  conversation_id?: string;
  model_key?: string;
}

@Controller('gwehai')
export class GwehAIController {
  constructor(
    private readonly gwehaiService: GwehAIService,
    @InjectRepository(Model)
    private readonly modelRepo: Repository<Model>,
  ) {}

  /**
   * Chat endpoint: creates a job and returns job_id. Client uses that job_id to stream.
   * POST /api/gwehai/chat → { job_id, conversation_id, ... }
   * Flow: 1) POST chat → get job_id. 2) GET chat/stream?stream_id=<job_id> to stream. Each conversation has many job_ids (one per message).
   */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  async startChat(@Req() req: Request, @Body() body: any) {
    const user = req.user as any;
    console.log(`User ${user.id} starting local AI chat`);
    return this.gwehaiService.startChat(user.id, body);
  }

  /**
   * Stream endpoint: use the job_id from the chat response.
   * GET /api/gwehai/chat/stream?stream_id=<job_id>
   */
  @Get('chat/stream')
  async streamChat(@Query('stream_id') streamId: string, @Req() req: Request, @Res() res: Response) {
    if (!streamId) {
      throw new HttpException('stream_id is required', HttpStatus.BAD_REQUEST);
    }
    const job = this.gwehaiService.getJob(streamId);
    const lastEventId = Number(req.headers['last-event-id'] || 0) || 0;
    this.streamJob(res, job, lastEventId, undefined);
  }

  /**
   * Proxy chat completion request
   * POST /api/gwehai/chat/completions
   */
  @Post('chat/completions')
  @UseGuards(JwtAuthGuard)
  async createJob(@Req() req: Request, @Body() body: ChatCompletionRequest) {
    const user = req.user as any;
    console.log(`User ${user.id} creating local AI job`);

    const { messages, stream = false, job_id, conversation_id, model_key } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpException(
        'Messages array is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Auto = DeepSeek. Default to 'auto' so we never run without a model (avoids "Model not found").
    const validModelKey = (model_key && ['auto', 'deepseek', 'openai_gpt5', 'claude', 'gemini'].includes(model_key)
      ? model_key
      : 'auto') as 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' | 'gemini';
    return this.gwehaiService.createJob(user.id, messages, stream, conversation_id || job_id, validModelKey);
  }

  /**
   * List current user's jobs (running first, then recent). Used by Current Pentest modal to show all jobs.
   * GET /api/gwehai/jobs
   */
  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  async listJobs(@Req() req: Request) {
    const user = req.user as any;
    return this.gwehaiService.listJobsForUser(user.id);
  }

  /**
   * Get job status
   * GET /api/gwehai/job/:id
   */
  @Get('job/:id')
  @UseGuards(JwtAuthGuard)
  async getJobStatus(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    console.log(`User ${user.id} checking job status: ${id}`);
    return this.gwehaiService.getJobStatus(id, user.id);
  }

  /**
   * Get SSE URL for frontend
   * GET /api/gwehai/job/:id/events/url
   */
  @Get('job/:id/events/url')
  @UseGuards(JwtAuthGuard)
  async getSSEUrl(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    const url = `/gwehai/chat/stream?stream_id=${encodeURIComponent(id)}`;
    return { url, job_id: id };
  }

  /**
   * Proxy SSE events - stream through backend
   * GET /api/gwehai/job/:id/events
   * Note: EventSource doesn't support custom headers, so we accept token as query param
   */
  @Get('job/:id/events')
  @UseGuards(GwehAISSEGuard)
  async streamEvents(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    const userId = user?.id || user?.sub;
    console.log(`SSE connection for job ${id} by user ${userId || 'unknown'}`);
    const job = this.gwehaiService.getJob(id, userId);
    const lastEventId = Number(req.headers['last-event-id'] || 0) || 0;
    this.streamJob(res, job, lastEventId, userId);
  }

  /**
   * Stop a job
   * POST /api/gwehai/job/:id/stop
   */
  @Post('job/:id/stop')
  @UseGuards(JwtAuthGuard)
  async stopJob(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.gwehaiService.stopJob(id, user.id);
  }

  /**
   * Continue a job
   * POST /api/gwehai/job/:id/continue
   */
  @Post('job/:id/continue')
  @UseGuards(JwtAuthGuard)
  async continueJob(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.gwehaiService.continueJob(id, user.id);
  }

  /**
   * List model options for the Model Provider Selector (Auto, OpenAI GPT5, Claude).
   * Auto uses DeepSeek. Options are sourced from DB "models" (if present) so
   * admin changes to display name / active flag are reflected in the UI.
   * Falls back to static config when DB has no matching models.
   * GET /api/gwehai/models
   */
  @Get('models')
  async listModels() {
    // Prefer DB-backed models so admin can control which provider options are active.
    const rows = await this.modelRepo.find({
      where: { isActive: true },
      order: { isDefault: 'DESC', displayName: 'ASC' },
    });

    // Map DB models that were seeded from model-options (metadata.key).
    const fromDb = rows
      .map((m) => {
        const meta = (m.metadata || {}) as Record<string, any>;
        const key = (meta.key as string) || '';
        if (!['auto', 'deepseek', 'openai_gpt5', 'claude', 'gemini'].includes(key)) return null;
        return {
          key,
          label: m.displayName || m.name || key,
          provider: (meta.provider as string) || m.provider || 'custom',
        };
      })
      .filter((v): v is { key: string; label: string; provider: string } => !!v);

    if (fromDb.length > 0) {
      // Keep DeepSeek as internal-only; expose Auto, OpenAI GPT5, Claude.
      const filtered = fromDb.filter((o) => o.key !== 'deepseek');
      if (filtered.length > 0) {
        return { options: filtered };
      }
    }

    // Fallback: static config (no DB rows yet).
    const options = getModelOptions()
      .filter((o) => o.key !== 'deepseek')
      .map((o) => ({ key: o.key, label: o.label, provider: o.provider }));
    return { options };
  }

  /**
   * Health check
   * GET /api/gwehai/health
   */
  @Get('health')
  async healthCheck() {
    const isHealthy = await this.gwehaiService.healthCheck();
    return {
      status: isHealthy ? 'ok' : 'error',
      service: 'Local AI',
    };
  }

  /**
   * Stream endpoint: poll job.events and yield SSE.
   * First event: connected. Then for each new event in job.events, send event.type + event.data.
   * On 'done' or job stopped, close stream.
   * When the client disconnects (res close), stop the job so no background AI requests continue (saves cost).
   */
  private streamJob(
    res: Response,
    job: { id: string; events: Array<{ type: string; data: any }> },
    lastEventId: number = 0,
    userId?: string,
  ) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any, eventId?: number) => {
      if (res.writableEnded) return;
      if (eventId != null && Number.isFinite(eventId)) {
        res.write(`id: ${eventId}\n`);
      }
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('connected', { stream_id: job.id });

    this.gwehaiService.incrementStreamConnections(job.id);

    // Resume from next event after Last-Event-ID when EventSource reconnects.
    let lastSentIndex = Math.max(0, Math.floor(lastEventId));
    const POLL_MS = 50;

    const pollInterval = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(pollInterval);
        return;
      }

      let currentJob: { id: string; status?: string; events?: Array<{ type: string; data: any }> } | null = null;
      try {
        currentJob = this.gwehaiService.getJob(job.id, userId ?? undefined);
      } catch {
        currentJob = null;
      }
      if (!currentJob) {
        clearInterval(pollInterval);
        sendEvent('done', { job_id: job.id, message: 'Job no longer available' });
        if (!res.writableEnded) res.end();
        return;
      }
      if (currentJob.status === 'stopped') {
        clearInterval(pollInterval);
        sendEvent('status', { message: 'Stopped' });
        sendEvent('done', { job_id: job.id });
        if (!res.writableEnded) res.end();
        return;
      }

      const events = currentJob.events ?? job.events;
      for (let i = lastSentIndex; i < events.length; i++) {
        const ev = events[i];
        // Always send error events with a normalized message only; never forward raw API error object
        const payload =
          ev.type === 'error' && ev.data
            ? (() => {
                const raw =
                  ev.data.message ??
                  ev.data.error?.message ??
                  (typeof ev.data.error === 'string' ? ev.data.error : JSON.stringify(ev.data.error ?? ev.data));
                const message = normalizeLlmErrorMessage(raw);
                return {
                  message,
                  ...(ev.data.agent_index != null && { agent_index: ev.data.agent_index }),
                  ...(ev.data.agent_label != null && { agent_label: ev.data.agent_label }),
                  ...(ev.data.error_code != null && { error_code: ev.data.error_code }),
                };
              })()
            : ev.data;
        sendEvent(ev.type, payload, i + 1);
        lastSentIndex = i + 1;
        // Do not close stream on sub-agent done; only close when main/global run is done.
        const hasAgentIndex = ev?.data?.agent_index != null;
        const isMainOrGlobalDone = !hasAgentIndex || Number(ev?.data?.agent_index) === 1;
        if (ev.type === 'done' && isMainOrGlobalDone) {
          clearInterval(pollInterval);
          if (!res.writableEnded) res.end();
          return;
        }
      }
    }, POLL_MS);

    res.on('close', () => {
      clearInterval(pollInterval);
      // When the last client disconnects, stop the job so no background AI calls continue (saves cost).
      this.gwehaiService.decrementStreamConnections(job.id, userId).catch((err) =>
        console.warn(`[gwehai] decrement stream / stop on disconnect failed for job ${job.id}:`, err?.message),
      );
    });
  }

}
