import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { ToolsService } from './tools.service';

/** Tools API is admin-only. Normal users run tools only via the chat agent (scoped to their conversation). */
@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

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
}
