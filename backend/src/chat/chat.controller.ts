import { Controller, Post, Get, Delete, Body, Param, UseGuards, Req, Res, BadRequestException, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request, Response } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && UUID_REGEX.test(id.trim());
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  modelId?: string;
  model_key?: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Active SSE stream AbortControllers keyed by conversationId. */
  private readonly activeAbortControllers = new Map<string, AbortController>();

  @Post()
  async chat(@Req() req: Request, @Body() body: ChatRequest) {
    const user = req.user as any;
    const result = await this.chatService.processMessage(
      user.id,
      body.message,
      body.conversationId,
      body.modelId,
    );
    return result;
  }

  /**
   * Simple conversation: returns { reply, details?, followUps? } for ChatGPT-style UI.
   * Uses GwehAI identity prompt; model returns JSON with reply (required), optional details (markdown), optional followUps (string[]).
   */
  @Post('conversation')
  async conversation(@Req() req: Request, @Body() body: { message: string; conversationId?: string; model_key?: string }) {
    const user = req.user as any;
    if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
      throw new BadRequestException('message is required');
    }
    return this.chatService.getSimpleConversationResponse(user.id, body.message.trim(), {
      conversationId: body.conversationId,
      model_key: body.model_key as any,
    });
  }

  /**
   * Get user's conversations — titles only by default (lazy-load).
   * Pass ?include_messages=true to include messages inline.
   */
  @Get('conversations')
  async getConversations(@Req() req: Request, @Query('include_messages') includeMessages?: string) {
    const user = req.user as any;
    const includeMsgs = includeMessages === 'true' || includeMessages === '1';
    return await this.chatService.getUserConversations(user.id, includeMsgs);
  }

  @Get('conversations/:id')
  async getConversation(@Req() req: Request, @Param('id') id: string) {
    if (!isValidUuid(id)) {
      throw new BadRequestException('Conversation id must be a valid UUID');
    }
    const user = req.user as any;
    return await this.chatService.getConversation(user.id, id.trim());
  }

  @Delete('conversations/:id')
  async deleteConversation(@Req() req: Request, @Param('id') id: string) {
    if (!isValidUuid(id)) {
      throw new BadRequestException('Conversation id must be a valid UUID');
    }
    const user = req.user as any;
    await this.chatService.deleteConversation(user.id, id.trim());
    return { ok: true };
  }

  @Get('models')
  async getModels() {
    return await this.chatService.getModels();
  }

  /**
   * SSE Streaming endpoint — streams agent events in real-time.
   * POST /chat/stream
   * Body: { message, conversationId?, model_key? }
   * Response: SSE text/event-stream
   */
  @Post('stream')
  async streamChat(@Req() req: Request, @Body() body: ChatRequest, @Res() res: Response) {
    const user = req.user as any;
    if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
      res.status(400).json({ message: 'message is required' });
      return;
    }

    const jobId = crypto.randomUUID();
    const abortController = new AbortController();

    // Store AbortController keyed by conversationId for stop/cancel support
    if (body.conversationId) {
      this.activeAbortControllers.set(body.conversationId, abortController);
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const sendEvent = (type: string, data: any) => {
      if (res.writableEnded) return;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('connected', { job_id: jobId });

    // Abort on client disconnect
    req.on('close', () => {
      abortController.abort();
      if (body.conversationId) {
        this.activeAbortControllers.delete(body.conversationId);
      }
    });

    try {
      await this.chatService.processMessageWithTools(
        user.id,
        body.message.trim(),
        body.conversationId,
        jobId,
        (ev) => sendEvent(ev.type, ev.data),
        undefined, // agentInfo
        undefined, // memoryScopeIdOverride
        {
          model_key: body.model_key as any,
          emitDoneEvent: true,
          abortSignal: abortController.signal,
        },
      );
    } catch (err: any) {
      sendEvent('error', { message: err?.message || 'Stream error' });
    } finally {
      if (body.conversationId) {
        this.activeAbortControllers.delete(body.conversationId);
      }
      if (!res.writableEnded) res.end();
    }
  }

  /**
   * Stop/cancel an active chat stream.
   * POST /chat/conversations/:id/stop
   */
  @Post('conversations/:id/stop')
  async stopConversation(@Req() req: Request, @Param('id') id: string) {
    if (!isValidUuid(id)) {
      throw new BadRequestException('Conversation id must be a valid UUID');
    }
    const cid = id.trim();

    // Abort active stream if running
    const abortController = this.activeAbortControllers.get(cid);
    if (abortController) {
      abortController.abort();
      this.activeAbortControllers.delete(cid);
    }

    // Set conversation runStatus to 'stopped'
    await this.chatService.setConversationRunStatus(cid, 'stopped');

    return { ok: true };
  }
}
