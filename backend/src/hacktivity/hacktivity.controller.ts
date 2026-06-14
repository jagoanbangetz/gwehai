import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { HacktivityService } from './hacktivity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('hacktivity')
@UseGuards(JwtAuthGuard)
export class HacktivityController {
  constructor(private readonly hacktivityService: HacktivityService) {}

  /** List AI activity for the user. Optional: conversationId, limit, offset. Returns { items, total }. */
  @Get()
  async list(
    @Req() req: Request,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const user = req.user as any;
    return this.hacktivityService.list(user.id, {
      conversationId: conversationId || undefined,
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
    });
  }

  /** List conversations that have hacktivity (for filter dropdown). Must be before :id route. */
  @Get('conversations')
  async listConversations(@Req() req: Request) {
    const user = req.user as any;
    return this.hacktivityService.listConversations(user.id);
  }

  /** Get one activity row for detail view. */
  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hacktivityService.getOne(user.id, id);
  }

  /** Get parsed/structured result for a hacktivity entry. */
  @Get(':id/parsed')
  async getParsed(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.hacktivityService.getParsed(user.id, id);
  }
}
