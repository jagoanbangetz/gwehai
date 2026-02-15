import { Controller, Get, Param, Query, UseGuards, Req, Post, Body } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { ReportStatus } from '../entities/report.entity';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** List reports: flat (groupBy=parent) or tree (format=tree with agents as children). */
  @Get()
  async listReports(@Req() req: Request, @Query('groupBy') groupBy?: string, @Query('format') format?: string) {
    const user = req.user as any;
    if (format === 'tree') {
      return this.reportsService.listReportsTree(user.id);
    }
    return this.reportsService.listGroupedByConversation(user.id, {
      groupByParent: groupBy === 'parent',
    });
  }

  /** List all findings for one conversation (for "Detail" on a report row). */
  @Get('by-conversation/:conversationId')
  async listFindingsByConversation(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
  ) {
    const user = req.user as any;
    return this.reportsService.listFindingsByConversation(user.id, conversationId);
  }

  /** List all findings for a run (main + sub-agent conversations). Use when list was loaded with groupBy=parent. */
  @Get('by-run/:rootConversationId')
  async listFindingsByRun(
    @Req() req: Request,
    @Param('rootConversationId') rootConversationId: string,
  ) {
    const user = req.user as any;
    return this.reportsService.listFindingsByRun(user.id, rootConversationId);
  }

  @Get(':id')
  async getReport(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.reportsService.getReportForUser(user.id, id);
  }

  // Simple endpoint to register a new report job from the frontend
  @Post()
  async createReport(
    @Req() req: Request,
    @Body()
    body: {
      jobId: string;
      target?: string;
      fileUrl?: string;
      status?: ReportStatus;
      metadata?: Record<string, any>;
    },
  ) {
    const user = req.user as any;
    return this.reportsService.createReportForUser(user.id, body);
  }
}

