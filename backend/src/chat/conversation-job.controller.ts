import { Controller, Get, Param, Query, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationJobService } from './conversation-job.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && UUID_REGEX.test(id.trim());
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ConversationJobController {
  constructor(
    private readonly conversationJobService: ConversationJobService,
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
  ) {}

  /**
   * GET /chat/conversations/:id/status
   * Returns current job status for a conversation.
   */
  @Get('conversations/:id/status')
  async getConversationStatus(@Req() req: Request, @Param('id') id: string) {
    if (!isValidUuid(id)) {
      throw new BadRequestException('Conversation id must be a valid UUID');
    }
    const user = req.user as any;
    const cid = id.trim();

    // Verify ownership
    const conv = await this.conversationRepo.findOne({ where: { id: cid, userId: user.id } });
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    return this.conversationJobService.getConversationStatus(cid);
  }
}

@Controller('job')
@UseGuards(JwtAuthGuard)
export class EventLogController {
  constructor(private readonly conversationJobService: ConversationJobService) {}

  /**
   * GET /job/:job_id/event-log?since=<seq>
   * Returns events since sequence number.
   */
  @Get(':job_id/event-log')
  async getEventLog(
    @Param('job_id') jobId: string,
    @Query('since') since?: string,
  ) {
    if (!isValidUuid(jobId)) {
      throw new BadRequestException('job_id must be a valid UUID');
    }
    const sinceSeq = since ? parseInt(since, 10) : 0;
    if (isNaN(sinceSeq) || sinceSeq < 0) {
      throw new BadRequestException('since must be a non-negative integer');
    }

    const events = await this.conversationJobService.getEventsSince(jobId.trim(), sinceSeq);
    return {
      job_id: jobId.trim(),
      since: sinceSeq,
      events,
    };
  }
}
