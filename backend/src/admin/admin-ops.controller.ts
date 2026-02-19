import { Controller, Get, Post, Body, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../entities/user.entity';
import { GwehAIService } from '../gwehai/gwehai.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { AdminService } from './admin.service';
import { Request } from 'express';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOpsController {
  constructor(
    private readonly gwehaiService: GwehAIService,
    private readonly planUsageService: PlanUsageService,
    private readonly adminService: AdminService,
  ) {}

  @Get('jobs/live')
  async getJobsLive() {
    const jobs = this.gwehaiService.getActiveJobsForAdmin();
    const withMeta = jobs.map((j) => {
      const duration = j.createdAt ? Math.round((Date.now() - j.createdAt) / 1000) : 0;
      return {
        job_id: j.job_id,
        userId: j.userId,
        conversationId: j.conversationId,
        target: j.userMessage?.slice(0, 120) || '—',
        status: j.status,
        phase: '—',
        started: j.createdAt,
        durationSeconds: duration,
        workerId: j.job_id,
        userMessage: j.userMessage,
      };
    });
    return { items: withMeta };
  }

  @Post('jobs/action')
  async postJobsAction(
    @Body() body: { jobId: string; action: 'pause' | 'resume' | 'cancel' | 'retry' },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    if (!body.jobId || !['pause', 'resume', 'cancel', 'retry'].includes(body.action || '')) {
      throw new HttpException('jobId and action (pause|resume|cancel|retry) required', HttpStatus.BAD_REQUEST);
    }
    let stopped = false;
    try {
      await this.gwehaiService.stopJob(body.jobId);
      stopped = true;
    } catch {
      // job not found or already stopped
    }
    await this.adminService.log(adminUser.id, `ops_job_${body.action}`, {
      resource: body.jobId,
      details: JSON.stringify({ action: body.action, stopped }),
      ipAddress: ip,
    });
    return { ok: true, action: body.action, stopped: !!stopped };
  }

  @Get('workers/status')
  async getWorkersStatus() {
    const jobs = this.gwehaiService.getActiveJobsForAdmin();
    const activeWorkers = jobs.filter((j) => j.status === 'running').length;
    const maxWorkers = 10;
    const queueSize = 0;
    const stuckJobs = 0;
    return {
      activeWorkers,
      maxWorkers,
      queueSize,
      stuckJobs,
    };
  }

  @Post('workers/restart')
  async postWorkersRestart(@Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    await this.adminService.log(adminUser.id, 'ops_workers_restart', {
      resource: 'workers',
      details: 'Restart workers (no-op unless PlanUsageService exposes clear)',
      ipAddress: ip,
    });
    return { ok: true };
  }
}
