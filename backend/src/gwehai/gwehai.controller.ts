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
import { GwehAIService } from './gwehai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GwehAISSEGuard } from './gwehai-sse.guard';

interface ChatCompletionRequest {
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  job_id?: string;
}

@Controller('gwehai')
export class GwehAIController {
  constructor(private readonly gwehaiService: GwehAIService) {}

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
    this.streamJob(res, job, lastEventId);
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

    const { messages, stream = false, job_id } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpException(
        'Messages array is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.gwehaiService.createJob(user.id, messages, stream, job_id);
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
    console.log(`SSE connection for job ${id} by user ${user?.sub || user?.id || 'unknown'}`);
    const job = this.gwehaiService.getJob(id, user?.id || user?.sub);
    const lastEventId = Number(req.headers['last-event-id'] || 0) || 0;
    this.streamJob(res, job, lastEventId);
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
   */
  private streamJob(
    res: Response,
    job: { id: string; events: Array<{ type: string; data: any }> },
    lastEventId: number = 0,
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

    // Resume from next event after Last-Event-ID when EventSource reconnects.
    let lastSentIndex = Math.max(0, Math.floor(lastEventId));
    const POLL_MS = 50;

    const pollInterval = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(pollInterval);
        return;
      }

      const currentJob = this.gwehaiService.getJob(job.id);
      if (currentJob?.status === 'stopped') {
        clearInterval(pollInterval);
        sendEvent('status', { message: 'Stopped' });
        sendEvent('done', { job_id: job.id });
        if (!res.writableEnded) res.end();
        return;
      }

      const events = currentJob?.events ?? job.events;
      for (let i = lastSentIndex; i < events.length; i++) {
        const ev = events[i];
        sendEvent(ev.type, ev.data, i + 1);
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
    });
  }

}
