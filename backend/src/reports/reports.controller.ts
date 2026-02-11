import { Controller, Get, Param, UseGuards, Req, Post, Body } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { ReportStatus } from '../entities/report.entity';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** List reports grouped by conversation (conversationId, website, findingsCount) for the Report menu. */
  @Get()
  async listReports(@Req() req: Request) {
    const user = req.user as any;
    return this.reportsService.listGroupedByConversation(user.id);
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

