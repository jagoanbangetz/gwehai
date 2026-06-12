import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { ToolsService } from './tools.service';
import { ToolAvailabilityService } from './tool-availability.service';
import { WebSearchService } from './web-search.service';

/** Tools API is admin-only. Normal users run tools only via the chat agent (scoped to their conversation). */
@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ToolsController {
  constructor(
    private readonly toolsService: ToolsService,
    private readonly toolAvailability: ToolAvailabilityService,
    private readonly webSearchService: WebSearchService,
  ) {}

  /**
   * GET /tools/available
   * Returns the list of verified available tools in the pentest container.
   * Cached for 1 hour; pass ?refresh=true to force re-probe.
   */
  @Get('available')
  async getAvailableTools() {
    return this.toolAvailability.getAvailableTools();
  }

  @Post('memory_search')
  async memorySearch(@Body() body: { query: string; max_results?: number }) {
    return {
      results: await this.toolsService.memorySearch(body.query, body.max_results),
    };
  }

  @Post('memory_get')
  async memoryGet(@Body() body: { path: string; from?: number; lines?: number }) {
    return {
      path: body.path,
      text: await this.toolsService.memoryGet(body.path, body.from, body.lines),
    };
  }

  @Post('write_file')
  async writeFile(@Body() body: { path: string; content: string; append?: boolean }) {
    return this.toolsService.writeFile(body.path, body.content, body.append);
  }

  @Post('exec')
  async exec(@Body() body: { command: string; args?: string[]; target?: string; timeoutMs?: number; cwd?: string }) {
    return this.toolsService.execCommand(body);
  }

  /**
   * POST /tools/web-search
   * Web search for exploits, techniques, and reference fetching.
   * Body: { query, type: 'exploit' | 'technique' | 'reference', url?, sessionId? }
   * Rate limit: max 10 searches per session. Results cached 1h.
   */
  @Post('web-search')
  async webSearch(@Body() body: { query: string; type: 'exploit' | 'technique' | 'reference'; url?: string; sessionId?: string }) {
    return this.webSearchService.search(body.query, body.type, body.url, body.sessionId);
  }

  /**
   * GET /tools/web-search/remaining?sessionId=xxx
   * Check remaining web searches for a session.
   */
  @Get('web-search/remaining')
  async webSearchRemaining(@Body() body: { sessionId?: string }) {
    const sid = body?.sessionId || 'global';
    return { sessionId: sid, remaining: this.webSearchService.getRemainingSearches(sid) };
  }
}
