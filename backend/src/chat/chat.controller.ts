import { Controller, Post, Get, Delete, Body, Param, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

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

  @Get('conversations')
  async getConversations(@Req() req: Request) {
    const user = req.user as any;
    return await this.chatService.getUserConversations(user.id);
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
}
