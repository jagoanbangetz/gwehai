import { Controller, Get, Post, Put, Patch, Body, Query, Param, UseGuards, Req, HttpException, HttpStatus, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../entities/user.entity';
import { Model } from '../entities/model.entity';
import { CreditOrder, CreditOrderStatus } from '../entities/credit-order.entity';
import { Report } from '../entities/report.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Message } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { MessageFile } from '../entities/message-file.entity';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Hacktivity } from '../entities/hacktivity.entity';
import { AdminSetting } from '../entities/admin-setting.entity';
import { AbuseEvent } from '../entities/abuse-event.entity';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { AdminSettingsService } from './admin-settings.service';
import { GwehAIService } from '../gwehai/gwehai.service';
import { HacktivityService } from '../hacktivity/hacktivity.service';
import { GwehAISSEGuard } from '../gwehai/gwehai-sse.guard';
import { PlanUsageService } from '../plans/plan-usage.service';
import { getPlanDefinition, type PlanId } from '../config/plans.config';
import { Observable } from 'rxjs';
import { MailService } from '../mail/mail.service';
import { PentestJobsService } from '../pentest-jobs/pentest-jobs.service';
import { DbBackupService } from './db-backup.service';
import * as bcrypt from 'bcrypt';

const WIPE_CONFIRM_PHRASE = 'WIPE_ALL_DATA';
const PLAN_IDS: PlanId[] = ['FREE', 'PRO', 'PRO_PLUS', 'ULTRA'];
const POINTS_TO_USD = 0.0001;
const POLICY_KEYS = [
  'blockLocalhost', 'blockRfc1918Ip', 'blockMetadataEndpoints', 'blockRepeatedTargetScanning',
  'enforcePerPlanToolRestrictions', 'strictExploitModeProOnly',
  'maxParallelJobsPerPlan', 'maxSubAgentsPerPlan', 'maxToolCallsPerJob', 'maxStepsPerConversation',
];

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Model)
    private readonly modelRepo: Repository<Model>,
    @InjectRepository(CreditOrder)
    private readonly orderRepo: Repository<CreditOrder>,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(UsageEvent)
    private readonly usageRepo: Repository<UsageEvent>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(MessagePart)
    private readonly messagePartRepo: Repository<MessagePart>,
    @InjectRepository(MessageFile)
    private readonly messageFileRepo: Repository<MessageFile>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMemory)
    private readonly memoryRepo: Repository<ConversationMemory>,
    @InjectRepository(Hacktivity)
    private readonly hacktivityRepo: Repository<Hacktivity>,
    @InjectRepository(AdminSetting)
    private readonly settingsRepo: Repository<AdminSetting>,
    @InjectRepository(AbuseEvent)
    private readonly abuseRepo: Repository<AbuseEvent>,
    private readonly adminService: AdminService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly gwehaiService: GwehAIService,
    private readonly hacktivityService: HacktivityService,
    private readonly planUsageService: PlanUsageService,
    private readonly mailService: MailService,
    private readonly pentestJobsService: PentestJobsService,
    private readonly dbBackupService: DbBackupService,
  ) {}

  @Get('dashboard')
  async getDashboardSummary(@Query('days') days?: string) {
    const rangeDays = [1, 7, 30].includes(parseInt(days || '0', 10))
      ? parseInt(days!, 10)
      : 0;
    const start = rangeDays
      ? (() => {
          const s = new Date();
          s.setDate(s.getDate() - rangeDays);
          s.setHours(0, 0, 0, 0);
          return s;
        })()
      : null;

    const [
      userCount,
      adminCount,
      modelCount,
      orderCount,
      reportCount,
      conversationCount,
      hacktivityCount,
      usageCount,
      usersInRange,
      conversationsInRange,
      reportsInRange,
      usageInRange,
    ] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { role: UserRole.ADMIN } }),
      this.modelRepo.count(),
      this.orderRepo.count(),
      this.reportRepo.count(),
      this.conversationRepo.count(),
      this.hacktivityRepo.count(),
      this.usageRepo.count(),
      start
        ? this.userRepo.count({ where: { createdAt: MoreThanOrEqual(start) as any } })
        : Promise.resolve(0),
      start
        ? this.conversationRepo.count({ where: { createdAt: MoreThanOrEqual(start) as any } })
        : Promise.resolve(0),
      start
        ? this.reportRepo.count({ where: { createdAt: MoreThanOrEqual(start) as any } })
        : Promise.resolve(0),
      start
        ? this.usageRepo.count({ where: { createdAt: MoreThanOrEqual(start) as any } })
        : Promise.resolve(0),
    ]);

    const activeJobs = this.gwehaiService.getActiveJobsForAdmin();
    const recentActivity = await this.usageRepo.find({
      order: { createdAt: 'DESC' as any },
      take: 20,
      relations: ['user', 'model'],
    });

    return {
      users: rangeDays ? usersInRange : userCount,
      admins: adminCount,
      aiAgents: modelCount,
      payments: orderCount,
      reports: rangeDays ? reportsInRange : reportCount,
      conversations: rangeDays ? conversationsInRange : conversationCount,
      hacktivityTotal: hacktivityCount,
      usage: rangeDays ? usageInRange : usageCount,
      activeJobsCount: activeJobs.filter((j) => j.status === 'running').length,
      activeJobs: activeJobs.slice(0, 50),
      recentActivity: recentActivity.map((e) => ({
        id: e.id,
        userId: e.userId,
        modelId: e.modelId,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        createdAt: e.createdAt,
        user: e.user ? { id: e.user.id, email: e.user.email } : undefined,
      })),
    };
  }

  @Get('dashboard/chart')
  async getDashboardChart(@Query('days') days?: string) {
    const numDays = Math.min(31, Math.max(1, parseInt(days || '7', 10) || 7));
    const start = new Date();
    start.setDate(start.getDate() - numDays);
    start.setHours(0, 0, 0, 0);

    const dateSeries: string[] = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dateSeries.push(d.toISOString().slice(0, 10));
    }

    const [userRows, convRows, activityRows] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .select('(u."createdAt")::date', 'date')
        .addSelect('COUNT(*)', 'count')
        .where('u."createdAt" >= :start', { start: start.toISOString() })
        .groupBy('(u."createdAt")::date')
        .getRawMany<{ date: string; count: string }>(),
      this.conversationRepo
        .createQueryBuilder('c')
        .select('(c."createdAt")::date', 'date')
        .addSelect('COUNT(*)', 'count')
        .where('c."createdAt" >= :start', { start: start.toISOString() })
        .groupBy('(c."createdAt")::date')
        .getRawMany<{ date: string; count: string }>(),
      this.usageRepo
        .createQueryBuilder('e')
        .select('(e."createdAt")::date', 'date')
        .addSelect('COUNT(*)', 'count')
        .where('e."createdAt" >= :start', { start: start.toISOString() })
        .groupBy('(e."createdAt")::date')
        .getRawMany<{ date: string; count: string }>(),
    ]);

    const mapByDate = (rows: { date: string | Date; count: string }[]) =>
      new Map(rows.map((r) => [String(r.date).slice(0, 10), parseInt(r.count, 10)]));

    const usersByDate = mapByDate(userRows);
    const convByDate = mapByDate(convRows);
    const activityByDate = mapByDate(activityRows);

    return {
      labels: dateSeries,
      datasets: [
        { label: 'New users', data: dateSeries.map((d) => usersByDate.get(d) ?? 0) },
        { label: 'Conversations', data: dateSeries.map((d) => convByDate.get(d) ?? 0) },
        { label: 'Activity (usage)', data: dateSeries.map((d) => activityByDate.get(d) ?? 0) },
      ],
    };
  }

  @Get('users')
  async listUsers(@Query('role') role?: string, @Query('search') search?: string, @Query('limit') limit?: string) {
    const take = Math.min(500, Math.max(1, parseInt(limit || '100', 10) || 100));
    const qb = this.userRepo.createQueryBuilder('u').orderBy('u.createdAt', 'DESC').take(take);
    if (role === 'admin') {
      qb.andWhere('u.role = :role', { role: UserRole.ADMIN });
    } else if (role === 'user') {
      qb.andWhere('u.role = :role', { role: UserRole.USER });
    }
    if (search && search.trim()) {
      qb.andWhere('(u.email ILIKE :search OR u.name ILIKE :search)', { search: `%${search.trim()}%` });
    }
    return qb.getMany();
  }

  @Patch('users/:id/plan')
  async setUserPlan(
    @Param('id') userId: string,
    @Body() body: { planId?: string },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const planId = (body.planId ?? '').toUpperCase();
    if (!PLAN_IDS.includes(planId as PlanId)) {
      throw new HttpException('Invalid planId. Use one of: FREE, PRO, PRO_PLUS, ULTRA', HttpStatus.BAD_REQUEST);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    user.planId = planId as PlanId;
    await this.userRepo.save(user);
    await this.adminService.log(adminUser.id, 'user_plan_change', {
      resource: userId,
      details: JSON.stringify({ planId: user.planId, email: user.email }),
      ipAddress: ip,
    });
    return { ok: true, planId: user.planId };
  }

  @Patch('users/:id/reset-password')
  async resetUserPassword(
    @Param('id') userId: string,
    @Body() body: { newPassword?: string },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    if (!body.newPassword || typeof body.newPassword !== 'string') {
      throw new HttpException('newPassword is required (min 8 characters)', HttpStatus.BAD_REQUEST);
    }
    if (body.newPassword.length < 8) {
      throw new HttpException('Password must be at least 8 characters', HttpStatus.BAD_REQUEST);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    user.password_hash = await bcrypt.hash(body.newPassword, 10);
    await this.userRepo.save(user);
    await this.adminService.log(adminUser.id, 'user_password_reset', {
      resource: userId,
      details: JSON.stringify({ email: user.email }),
      ipAddress: ip,
    });
    return { ok: true };
  }

  @Get('conversations')
  async listConversations(
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);
    const qb = this.conversationRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'user')
      .orderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(take);
    if (userId) {
      qb.andWhere('c.userId = :userId', { userId });
    }
    const [conversations, total] = await qb.getManyAndCount();
    const convIds = conversations.map((c) => c.id);
    const counts =
      convIds.length > 0
        ? await this.messageRepo
            .createQueryBuilder('m')
            .select('m.conversationId', 'conversationId')
            .addSelect('COUNT(*)', 'count')
            .where('m.conversationId IN (:...ids)', { ids: convIds })
            .groupBy('m.conversationId')
            .getRawMany<{ conversationId: string; count: string }>()
        : [];
    const countBy = new Map(counts.map((r) => [r.conversationId, Number(r.count)]));
    return {
      items: conversations.map((c) => ({
        id: c.id,
        userId: c.userId,
        title: c.title,
        createdAt: c.createdAt,
        messageCount: countBy.get(c.id) ?? 0,
        user: c.user ? { id: c.user.id, email: c.user.email } : undefined,
      })),
      total,
    };
  }

  @Get('conversations/:id')
  async getConversationById(@Param('id') id: string) {
    const conv = await this.conversationRepo.findOne({
      where: { id },
      relations: ['user', 'messages', 'messages.parts'],
    });
    if (!conv) throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    const sortedMessages = (conv.messages || []).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return {
      id: conv.id,
      userId: conv.userId,
      title: conv.title,
      modelId: conv.modelId,
      runStatus: conv.runStatus,
      pentestJobId: conv.pentestJobId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      user: conv.user ? { id: conv.user.id, email: conv.user.email } : undefined,
      messages: sortedMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        parts: (m.parts || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => ({ type: p.type, content: p.content, order: p.order })),
      })),
    };
  }

  @Get('jobs/active')
  async getActiveJobs() {
    return this.gwehaiService.getActiveJobsForAdmin();
  }

  @Get('hacktivity')
  async listHacktivity(
    @Query('userId') userId?: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);
    const qb = this.hacktivityRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.user', 'user')
      .orderBy('h.createdAt', 'DESC')
      .skip(skip)
      .take(take);
    if (userId) qb.andWhere('h.userId = :userId', { userId });
    if (conversationId) qb.andWhere('h.conversationId = :conversationId', { conversationId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Realtime admin hacktivity stream (SSE).
   * GET /api/admin/hacktivity/stream?token=<JWT>
   * Uses the same SSE guard/token pattern as gwehai job events.
   */
  @Sse('hacktivity/stream')
  @UseGuards(GwehAISSEGuard)
  hacktivityStream(): Observable<{ data: any }> {
    return this.hacktivityService.getAdminStream();
  }

  @Get('usage-summary')
  async getUsageSummary() {
    const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const [usageByUserRaw, totalRaw, byModelRaw, todayTokensByUser] = await Promise.all([
      this.usageRepo
        .createQueryBuilder('u')
        .innerJoin('u.user', 'user')
        .select('u.userId', 'userId')
        .addSelect('user.email', 'userEmail')
        .addSelect('user.planId', 'planId')
        .addSelect('SUM(u.inputTokens)', 'inputTokens')
        .addSelect('SUM(u.outputTokens)', 'outputTokens')
        .addSelect('SUM(u.costPoints)', 'costPoints')
        .addSelect('COUNT(*)', 'calls')
        .groupBy('u.userId')
        .addGroupBy('user.id')
        .addGroupBy('user.email')
        .addGroupBy('user.planId')
        .orderBy('COUNT(*)', 'DESC')
        .limit(100)
        .getRawMany<{ userId: string; userEmail: string; planId: string | null; inputTokens: string; outputTokens: string; costPoints: string; calls: string }>(),
      this.usageRepo
        .createQueryBuilder('u')
        .select('COALESCE(SUM(u.inputTokens), 0)', 'inputTokens')
        .addSelect('COALESCE(SUM(u.outputTokens), 0)', 'outputTokens')
        .addSelect('COALESCE(SUM(u.costPoints), 0)', 'costPoints')
        .addSelect('COALESCE(COUNT(*), 0)', 'calls')
        .getRawOne<{ inputTokens: string; outputTokens: string; costPoints: string; calls: string }>(),
      this.usageRepo
        .createQueryBuilder('u')
        .leftJoin('u.model', 'model')
        .select('u.modelId', 'modelId')
        .addSelect('model.name', 'modelName')
        .addSelect('model.displayName', 'modelDisplayName')
        .addSelect('SUM(u.inputTokens)', 'inputTokens')
        .addSelect('SUM(u.outputTokens)', 'outputTokens')
        .addSelect('SUM(u.costPoints)', 'costPoints')
        .addSelect('COUNT(*)', 'calls')
        .groupBy('u.modelId')
        .addGroupBy('model.id')
        .addGroupBy('model.name')
        .addGroupBy('model.displayName')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany<{ modelId: string; modelName: string; modelDisplayName: string; inputTokens: string; outputTokens: string; costPoints: string; calls: string }>(),
      this.usageRepo
        .createQueryBuilder('u')
        .select('u.userId', 'userId')
        .addSelect('SUM(u.inputTokens) + SUM(u.outputTokens)', 'tokensToday')
        .where('u.createdAt >= :today', { today })
        .groupBy('u.userId')
        .getRawMany<{ userId: string; tokensToday: string }>(),
    ]);
    const totalCostPoints = Number(totalRaw?.costPoints ?? 0);
    const total = totalRaw
      ? {
          inputTokens: String(totalRaw.inputTokens ?? 0),
          outputTokens: String(totalRaw.outputTokens ?? 0),
          calls: String(totalRaw.calls ?? 0),
          costPoints: String(totalCostPoints),
          costUsd: (totalCostPoints * POINTS_TO_USD).toFixed(4),
        }
      : { inputTokens: '0', outputTokens: '0', calls: '0', costPoints: '0', costUsd: '0.0000' };
    const todayMap = new Map(todayTokensByUser.map((r) => [r.userId, Number(r.tokensToday ?? 0)]));
    const byUser = usageByUserRaw.map((r) => {
      const planId = (r.planId?.trim()?.toUpperCase() || 'FREE') as PlanId;
      const def = getPlanDefinition(planId);
      const limit = def.limits.tokens_per_day === -1 ? null : def.limits.tokens_per_day;
      const tokensUsedToday = todayMap.get(r.userId) ?? 0;
      const costPts = Number(r.costPoints ?? 0);
      return {
        userId: r.userId,
        userEmail: r.userEmail ?? null,
        planId,
        inputTokens: String(r.inputTokens ?? 0),
        outputTokens: String(r.outputTokens ?? 0),
        calls: String(r.calls ?? 0),
        costPoints: String(costPts),
        costUsd: (costPts * POINTS_TO_USD).toFixed(4),
        tokensUsedToday,
        tokensPerDayLimit: limit,
      };
    });
    const byModel = byModelRaw.map((r) => {
      const costPts = Number(r.costPoints ?? 0);
      return {
        modelId: r.modelId,
        modelName: r.modelName ?? null,
        modelDisplayName: r.modelDisplayName ?? null,
        inputTokens: String(r.inputTokens ?? 0),
        outputTokens: String(r.outputTokens ?? 0),
        calls: String(r.calls ?? 0),
        costPoints: String(costPts),
        costUsd: (costPts * POINTS_TO_USD).toFixed(4),
      };
    });
    return { byUser, total, byModel };
  }

  @Get('health')
  async getHealth() {
    let dbOk = false;
    try {
      await this.userRepo.query('SELECT 1');
      dbOk = true;
    } catch {}
    return {
      ok: dbOk,
      database: dbOk ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('audit-log')
  async getAuditLog(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('adminUserId') adminUserId?: string,
  ) {
    return this.adminService.getAuditLogs({
      limit: limit != null ? parseInt(limit, 10) : undefined,
      offset: offset != null ? parseInt(offset, 10) : undefined,
      action: action || undefined,
      adminUserId: adminUserId || undefined,
    });
  }

  @Get('export')
  async export(
    @Query('type') type: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    const ip = this.adminService.getClientIp(req);
    await this.adminService.log(user.id, 'export', { resource: type, ipAddress: ip });

    const limit = 1000;
    if (type === 'users') {
      const items = await this.userRepo.find({ order: { createdAt: 'DESC' }, take: limit });
      return { type: 'users', count: items.length, items };
    }
    if (type === 'conversations') {
      const items = await this.conversationRepo.find({
        order: { createdAt: 'DESC' },
        take: limit,
        relations: ['user'],
      });
      return { type: 'conversations', count: items.length, items };
    }
    if (type === 'reports') {
      const items = await this.reportRepo.find({ order: { createdAt: 'DESC' }, take: limit });
      return { type: 'reports', count: items.length, items };
    }
    if (type === 'hacktivity') {
      const items = await this.hacktivityRepo.find({
        order: { createdAt: 'DESC' },
        take: limit,
      });
      return { type: 'hacktivity', count: items.length, items };
    }
    throw new HttpException('Invalid export type', HttpStatus.BAD_REQUEST);
  }

  @Get('ai-agents')
  async listAiAgents() {
    return this.modelRepo.find({
      order: { provider: 'ASC', displayName: 'ASC' },
    });
  }

  @Get('admin-users')
  async listAdminUsers() {
    return this.userRepo.find({
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'DESC' },
    });
  }

  @Get('payments')
  async listPayments() {
    return this.orderRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Get('reports')
  async listAllReports(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '100', 10) || 100));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);
    const [items, total] = await this.reportRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take,
      relations: ['user'],
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        userId: r.userId,
        user: r.user ? { id: r.user.id, email: r.user.email } : undefined,
        conversationId: r.conversationId,
        target: r.target,
        status: r.status,
        detail: r.detail,
        poc: r.poc,
        fileUrl: r.fileUrl,
        metadata: r.metadata,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
    };
  }

  @Get('reports/:id')
  async getReportById(@Param('id') id: string) {
    const report = await this.reportRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!report) throw new HttpException('Report not found', HttpStatus.NOT_FOUND);
    return {
      id: report.id,
      userId: report.userId,
      user: report.user ? { id: report.user.id, email: report.user.email } : undefined,
      conversationId: report.conversationId,
      target: report.target,
      status: report.status,
      detail: report.detail,
      poc: report.poc,
      jobId: report.jobId,
      fileUrl: report.fileUrl,
      metadata: report.metadata,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  @Get('user-activity')
  async listUserActivity() {
    return this.usageRepo.find({
      order: { createdAt: 'DESC' as any },
      take: 100,
      relations: ['user', 'model'],
    });
  }

  @Get('messages')
  async listMessages() {
    return this.messageRepo.find({
      order: { createdAt: 'DESC' as any },
      take: 100,
      relations: ['conversation'],
    });
  }

  @Get('ai-behaviour')
  async getAiBehaviour() {
    const qb = this.usageRepo
      .createQueryBuilder('usage')
      .select('usage.modelId', 'modelId')
      .addSelect('SUM(usage.inputTokens)', 'inputTokens')
      .addSelect('SUM(usage.outputTokens)', 'outputTokens')
      .addSelect('COUNT(*)', 'calls')
      .groupBy('usage.modelId')
      .orderBy('calls', 'DESC');
    const rows = await qb.getRawMany();
    return rows;
  }

  /**
   * GET /admin/settings — return all settings in the format the frontend expects:
   * { settings: Record<string, SettingMeta>, groups: Record<string, GroupMeta> }
   *
   * Each setting merges DB values (admin_settings table) with env fallbacks.
   */
  @Get('settings')
  async getSettings(@Req() req: Request) {
    // Setting registry: key → { group, label, envVar }
    const REGISTRY: Record<string, { group: string; label: string; envVar?: string }> = {
      // AI
      OPENAI_API_KEY:        { group: 'ai', label: 'OpenAI API Key', envVar: 'OPENAI_API_KEY' },
      GEMINI_API_KEY:        { group: 'ai', label: 'Gemini API Key', envVar: 'GEMINI_API_KEY' },
      GROQ_API_KEY:          { group: 'ai', label: 'Groq API Key', envVar: 'GROQ_API_KEY' },
      ANTHROPIC_API_KEY:     { group: 'ai', label: 'Anthropic API Key', envVar: 'ANTHROPIC_API_KEY' },
      DEEPSEEK_API_KEY:      { group: 'ai', label: 'DeepSeek API Key', envVar: 'DEEPSEEK_API_KEY' },
      OPENAI_BASE_URL:       { group: 'ai', label: 'OpenAI Base URL', envVar: 'OPENAI_BASE_URL' },

      // Email
      SMTP_HOST:             { group: 'email', label: 'SMTP Host', envVar: 'SMTP_HOST' },
      SMTP_PORT:             { group: 'email', label: 'SMTP Port', envVar: 'SMTP_PORT' },
      SMTP_USER:             { group: 'email', label: 'SMTP User', envVar: 'SMTP_USER' },
      SMTP_PASS:             { group: 'email', label: 'SMTP Password', envVar: 'SMTP_PASS' },
      SMTP_FROM:             { group: 'email', label: 'SMTP From Address', envVar: 'SMTP_FROM' },
      // Security
      CORS_ORIGINS:          { group: 'security', label: 'CORS Origins', envVar: 'CORS_ORIGINS' },
      RATE_LIMIT_WINDOW:     { group: 'security', label: 'Rate Limit Window (sec)', envVar: 'RATE_LIMIT_WINDOW' },
      RATE_LIMIT_MAX:        { group: 'security', label: 'Rate Limit Max Requests', envVar: 'RATE_LIMIT_MAX' },
      // Auth
      GOOGLE_CLIENT_ID:      { group: 'auth', label: 'Google Client ID', envVar: 'GOOGLE_CLIENT_ID' },
      GOOGLE_CLIENT_SECRET:  { group: 'auth', label: 'Google Client Secret', envVar: 'GOOGLE_CLIENT_SECRET' },
      GOOGLE_CALLBACK_URL:   { group: 'auth', label: 'Google Callback URL', envVar: 'GOOGLE_CALLBACK_URL' },
      JWT_SECRET:            { group: 'auth', label: 'JWT Secret', envVar: 'JWT_SECRET' },
      JWT_EXPIRES_IN:        { group: 'auth', label: 'JWT Expires In', envVar: 'JWT_EXPIRES_IN' },
      // General
      NODE_ENV:              { group: 'general', label: 'Environment', envVar: 'NODE_ENV' },
      PORT:                  { group: 'general', label: 'Server Port', envVar: 'PORT' },
      FRONTEND_URL:          { group: 'general', label: 'Frontend URL', envVar: 'FRONTEND_URL' },
      API_BASE_URL:          { group: 'general', label: 'API Base URL', envVar: 'API_BASE_URL' },
      // Branding
      site_logo_url:         { group: 'branding', label: 'Site Logo URL' },
      site_favicon_url:      { group: 'branding', label: 'Site Favicon URL' },
    };

    // Query all DB rows
    const dbRows = await this.settingsRepo.find();
    const dbMap = new Map(dbRows.map((r) => [r.key, r.value]));

    // Build settings map
    const settings: Record<string, { value: string; hasValue: boolean; source: 'db' | 'env'; label: string; group: string }> = {};
    const groupFields: Record<string, string[]> = {};

    for (const [key, meta] of Object.entries(REGISTRY)) {
      const dbVal = dbMap.get(key);
      const envVal = meta.envVar ? (process.env[meta.envVar] ?? '') : '';
      const hasDb = dbVal != null && dbVal !== '';
      const hasEnv = envVal !== '';

      settings[key] = {
        value: hasDb ? dbVal! : envVal,
        hasValue: hasDb || hasEnv,
        source: hasDb ? 'db' : 'env',
        label: meta.label,
        group: meta.group,
      };

      if (!groupFields[meta.group]) groupFields[meta.group] = [];
      groupFields[meta.group].push(key);
    }

    // Also include any extra DB keys not in the registry (custom settings)
    for (const [key, value] of dbMap.entries()) {
      if (!settings[key]) {
        settings[key] = {
          value: value ?? '',
          hasValue: value != null && value !== '',
          source: 'db',
          label: key,
          group: 'general',
        };
        if (!groupFields['general']) groupFields['general'] = [];
        groupFields['general'].push(key);
      }
    }

    // Build groups meta
    const GROUP_LABELS: Record<string, string> = {
      ai: 'AI',
      payment: 'Payment',
      email: 'Email',
      security: 'Security',
      auth: 'Authentication',
      general: 'General',
      branding: 'Branding',
    };

    const groups: Record<string, { label: string; fields: string[] }> = {};
    for (const [groupKey, fields] of Object.entries(groupFields)) {
      groups[groupKey] = {
        label: GROUP_LABELS[groupKey] ?? groupKey,
        fields,
      };
    }

    return { settings, groups };
  }

  /**
   * PUT /admin/settings — upsert settings from the admin UI.
   * Body: Record<string, string> (key → value).
   */
  @Put('settings')
  async updateSettings(@Body() body: Record<string, string>, @Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const entries = Object.entries(body);
    if (entries.length === 0) {
      throw new HttpException('No settings provided', HttpStatus.BAD_REQUEST);
    }

    for (const [key, value] of entries) {
      if (typeof key !== 'string' || typeof value !== 'string') continue;
      await this.settingsRepo.upsert(
        { key, value, updatedAt: new Date() },
        { conflictPaths: ['key'] },
      );

      // Sync API keys to process.env so services that still read env directly keep working
      if (key.endsWith('_API_KEY') || key.endsWith('_BASE_URL')) {
        process.env[key] = value;
      }

      // Invalidate cache so ProviderRouter picks up the new value immediately
      this.adminSettingsService.invalidate(key);
    }

    await this.adminService.log(adminUser.id, 'settings_update', {
      resource: 'admin/settings',
      details: JSON.stringify({ keys: entries.map(([k]) => k) }),
      ipAddress: ip,
    });

    return { ok: true, updated: entries.length };
  }

  @Get('cost/summary')
  async getCostSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const [todayRows, monthRows, totalCalls] = await Promise.all([
      this.usageRepo.createQueryBuilder('u').select('SUM(u.inputTokens)', 'input').addSelect('SUM(u.outputTokens)', 'output').addSelect('SUM(u.costPoints)', 'points').where('u.createdAt >= :today', { today: today + 'T00:00:00.000Z' }).getRawOne<{ input: string; output: string; points: string }>(),
      this.usageRepo.createQueryBuilder('u').select('SUM(u.inputTokens)', 'input').addSelect('SUM(u.outputTokens)', 'output').addSelect('SUM(u.costPoints)', 'points').where('u.createdAt >= :start', { start: startOfMonth + 'T00:00:00.000Z' }).getRawOne<{ input: string; output: string; points: string }>(),
      this.usageRepo.count(),
    ]);
    const totalTokensToday = Number(todayRows?.input ?? 0) + Number(todayRows?.output ?? 0);
    const totalTokensMonth = Number(monthRows?.input ?? 0) + Number(monthRows?.output ?? 0);
    const costToday = Number(todayRows?.points ?? 0) * POINTS_TO_USD;
    const costMonth = Number(monthRows?.points ?? 0) * POINTS_TO_USD;
    return {
      totalTokensToday,
      totalTokensThisMonth: totalTokensMonth,
      totalAICalls: totalCalls,
      estimatedCostUsd: (Number(monthRows?.points ?? 0) * POINTS_TO_USD).toFixed(2),
      today: { tokens: totalTokensToday, costUsd: costToday.toFixed(2) },
      month: { tokens: totalTokensMonth, costUsd: costMonth.toFixed(2) },
    };
  }

  @Get('cost/users')
  async getCostUsers(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('model') model?: string,
    @Query('plan') plan?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);

    const usageQb = this.usageRepo
      .createQueryBuilder('u')
      .select('u.userId', 'userId')
      .addSelect('SUM(u.inputTokens)', 'inputTokens')
      .addSelect('SUM(u.outputTokens)', 'outputTokens')
      .addSelect('SUM(u.costPoints)', 'costPoints')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('MAX(u.createdAt)', 'lastActive')
      .groupBy('u.userId');
    if (dateFrom) usageQb.andWhere('u.createdAt >= :dateFrom', { dateFrom: dateFrom + 'T00:00:00.000Z' });
    if (dateTo) usageQb.andWhere('u.createdAt <= :dateTo', { dateTo: dateTo + 'T23:59:59.999Z' });
    if (model) usageQb.andWhere('u.modelId = :model', { model });
    const usageRaw = await usageQb.getRawMany<{ userId: string; inputTokens: string; outputTokens: string; costPoints: string; calls: string; lastActive: string }>();
    const usageByUser = new Map(usageRaw.map((r) => [r.userId, r]));

    let userQb = this.userRepo.createQueryBuilder('user').select('user.id', 'id').addSelect('user.email', 'email').addSelect('user.planId', 'planId').addSelect('user.createdAt', 'createdAt').orderBy('user.createdAt', 'DESC');
    if (plan) userQb = userQb.andWhere('(user.planId = :plan OR (user.planId IS NULL AND :plan = \'FREE\'))', { plan });
    const allUsers = await userQb.getRawMany<{ id: string; email: string; planId: string; createdAt: string }>();
    const total = allUsers.length;
    const usersPage = allUsers.slice(skip, skip + take);

    const items = usersPage.map((u) => {
      const usage = usageByUser.get(u.id);
      return {
        user: u.email ?? u.id,
        userId: u.id,
        plan: u.planId ?? 'FREE',
        model: model ?? null,
        inputTokens: usage ? Number(usage.inputTokens ?? 0) : 0,
        outputTokens: usage ? Number(usage.outputTokens ?? 0) : 0,
        totalCost: (usage ? Number(usage.costPoints ?? 0) * POINTS_TO_USD : 0).toFixed(4),
        calls: usage ? Number(usage.calls ?? 0) : 0,
        lastActive: usage?.lastActive ?? null,
      };
    });
    return { items, total };
  }

  @Get('cost/settings')
  async getCostSettings() {
    const keys = ['globalDailyTokenCap', 'globalMonthlyTokenCap', 'perUserTokenCap', 'perPlanTokenCap', 'modelEscalationToggle'];
    const rows = await this.settingsRepo.find({ where: { key: In(keys) } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (v: string | null | undefined) => (v != null && v !== '' ? parseInt(v, 10) : undefined);
    const bool = (v: string | null | undefined) => v === 'true' || v === '1';
    return {
      globalDailyTokenCap: num(map.get('globalDailyTokenCap')) ?? undefined,
      globalMonthlyTokenCap: num(map.get('globalMonthlyTokenCap')) ?? undefined,
      perUserTokenCap: num(map.get('perUserTokenCap')) ?? undefined,
      perPlanTokenCap: map.get('perPlanTokenCap') ?? undefined,
      modelEscalationToggle: bool(map.get('modelEscalationToggle')),
    };
  }

  @Post('cost/settings')
  async saveCostSettings(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const keys = ['globalDailyTokenCap', 'globalMonthlyTokenCap', 'perUserTokenCap', 'perPlanTokenCap', 'modelEscalationToggle'];
    for (const key of keys) {
      const v = body[key];
      if (v === undefined) continue;
      await this.settingsRepo.upsert({ key, value: typeof v === 'object' ? JSON.stringify(v) : String(v), updatedAt: new Date() }, { conflictPaths: ['key'] });
    }
    await this.adminService.log(adminUser.id, 'cost_settings_update', { resource: 'admin/cost/settings', details: JSON.stringify(body), ipAddress: ip });
    return { ok: true };
  }

  @Get('abuse/summary')
  async getAbuseSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const [suspiciousToday, rateLimitViolations, repeatedTargets, highVelocity] = await Promise.all([
      this.abuseRepo.createQueryBuilder('a').select('COUNT(DISTINCT a.userId)', 'c').where('a.createdAt >= :today', { today: today + 'T00:00:00.000Z' }).andWhere('a.riskScore >= 50').getRawOne<{ c: string }>(),
      this.abuseRepo.count({ where: { eventType: 'rate_limit_violation' } }),
      this.abuseRepo.count({ where: { eventType: 'repeated_target' } }),
      this.abuseRepo.count({ where: { eventType: 'high_velocity' } }),
    ]);
    return {
      suspiciousUsersToday: parseInt(suspiciousToday?.c ?? '0', 10),
      rateLimitViolations: rateLimitViolations ?? 0,
      repeatedTargetAttempts: repeatedTargets ?? 0,
      highVelocityRequests: highVelocity ?? 0,
    };
  }

  @Get('abuse/events')
  async getAbuseEvents(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);
    const [items, total] = await this.abuseRepo.findAndCount({ order: { createdAt: 'DESC' }, skip, take });
    const userIds = [...new Set(items.map((e) => e.userId).filter(Boolean))] as string[];
    const users = userIds.length ? await this.userRepo.find({ where: userIds.map((id) => ({ id })), select: ['id', 'email'] }) : [];
    const userMap = new Map(users.map((u) => [u.id, u.email]));
    return {
      items: items.map((e) => ({
        id: e.id,
        user: e.userId ? userMap.get(e.userId) ?? e.userId : null,
        userId: e.userId,
        ip: e.ipAddress,
        requestsPerMin: e.requestsPerMin,
        domainsTargeted: e.domainsTargeted,
        riskScore: Number(e.riskScore),
        eventType: e.eventType,
        createdAt: e.createdAt,
      })),
      total,
    };
  }

  @Post('abuse/action')
  async postAbuseAction(@Body() body: { userId?: string; action?: string; reason?: string }, @Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    if (!body.userId || !['throttle', 'suspend', 'ban'].includes(body.action || '')) {
      throw new HttpException('userId and action (throttle|suspend|ban) required', HttpStatus.BAD_REQUEST);
    }
    const user = await this.userRepo.findOne({ where: { id: body.userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (body.action === 'ban' || body.action === 'suspend') {
      user.isActive = false;
      await this.userRepo.save(user);
    }
    await this.adminService.log(adminUser.id, `abuse_${body.action}`, { resource: body.userId, details: JSON.stringify({ reason: body.reason, email: user.email }), ipAddress: ip });
    return { ok: true, action: body.action };
  }

  @Get('jobs/live')
  async getJobsLive() {
    const [memJobs, dbPentestJobs] = await Promise.all([
      Promise.resolve(this.gwehaiService.getActiveJobsForAdmin()),
      this.pentestJobsService.listRecentForAdmin(50),
    ]);
    const liveItems = memJobs.map((j) => {
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
        source: 'live' as const,
      };
    });
    const liveConvIds = new Set(liveItems.map((i) => i.conversationId).filter(Boolean));
    const dbItems = dbPentestJobs
      .filter((p) => !p.conversationId || !liveConvIds.has(p.conversationId))
      .map((p) => {
        const started = p.createdAt instanceof Date ? p.createdAt.getTime() : new Date(p.createdAt).getTime();
        const duration = Math.round((Date.now() - started) / 1000);
        return {
          job_id: p.id,
          userId: p.userId,
          conversationId: p.conversationId || '',
          target: p.targetBaseUrl?.slice(0, 120) || '—',
          status: p.status,
          phase: '—',
          started,
          durationSeconds: duration,
          workerId: p.id,
          userMessage: p.seedPromptRedacted?.slice(0, 120) || '—',
          source: 'db' as const,
        };
      });
    return { items: [...liveItems, ...dbItems] };
  }

  @Post('jobs/action')
  async postJobsAction(@Body() body: { jobId?: string; action?: string }, @Req() req: Request) {
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
    await this.adminService.log(adminUser.id, `ops_job_${body.action}`, { resource: body.jobId, details: JSON.stringify({ action: body.action, stopped }), ipAddress: ip });
    return { ok: true, action: body.action, stopped: !!stopped };
  }

  @Get('workers/status')
  getWorkersStatus() {
    const jobs = this.gwehaiService.getActiveJobsForAdmin();
    const activeWorkers = jobs.filter((j) => j.status === 'running').length;
    return { activeWorkers, maxWorkers: 10, queueSize: 0, stuckJobs: 0 };
  }

  @Post('workers/restart')
  async postWorkersRestart(@Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    await this.adminService.log(adminUser.id, 'ops_workers_restart', { resource: 'workers', details: 'Restart workers', ipAddress: ip });
    return { ok: true };
  }

  @Get('policies')
  async getPolicies() {
    const rows = await this.settingsRepo.find({ where: { key: In(POLICY_KEYS) } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const bool = (v: string | null | undefined) => v === 'true' || v === '1';
    const num = (v: string | null | undefined, def: number) => (v != null && v !== '' ? parseInt(v, 10) : def);
    return {
      blockLocalhost: bool(map.get('blockLocalhost')),
      blockRfc1918Ip: bool(map.get('blockRfc1918Ip')),
      blockMetadataEndpoints: bool(map.get('blockMetadataEndpoints')),
      blockRepeatedTargetScanning: bool(map.get('blockRepeatedTargetScanning')),
      enforcePerPlanToolRestrictions: bool(map.get('enforcePerPlanToolRestrictions')),
      strictExploitModeProOnly: bool(map.get('strictExploitModeProOnly')),
      maxParallelJobsPerPlan: num(map.get('maxParallelJobsPerPlan'), 2),
      maxSubAgentsPerPlan: num(map.get('maxSubAgentsPerPlan'), 1),
      maxToolCallsPerJob: num(map.get('maxToolCallsPerJob'), 500),
      maxStepsPerConversation: num(map.get('maxStepsPerConversation'), 100),
    };
  }

  @Post('promotion/send')
  async sendPromotion(
    @Body() body: { subject?: string; bodyHtml?: string; segment?: string },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    if (!body.subject || !body.bodyHtml) {
      throw new HttpException('subject and bodyHtml are required', HttpStatus.BAD_REQUEST);
    }
    if (!this.mailService.isConfigured()) {
      throw new HttpException('SMTP is not configured. Cannot send promotion emails.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const segment = (body.segment ?? 'all').toUpperCase();
    const qb = this.userRepo.createQueryBuilder('u').select('u.id', 'id').addSelect('u.email', 'email').where('u.email IS NOT NULL').andWhere("u.email != ''");
    if (segment !== 'ALL' && PLAN_IDS.includes(segment as PlanId)) {
      qb.andWhere('(u.planId = :plan OR (u.planId IS NULL AND :plan = \'FREE\'))', { plan: segment });
    }
    const users = await qb.take(500).getRawMany<{ id: string; email: string }>();
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      const ok = await this.mailService.sendPromotionEmail(u.email, body.subject, body.bodyHtml);
      if (ok) sent++;
      else failed++;
    }
    await this.adminService.log(adminUser.id, 'promotion_send', {
      resource: 'promotion',
      details: JSON.stringify({ subject: body.subject, segment, sent, failed, total: users.length }),
      ipAddress: ip,
    });
    return { ok: true, sent, failed, total: users.length };
  }

  @Get('plans/definitions')
  getPlanDefinitions() {
    return PLAN_IDS.map((id) => {
      const def = getPlanDefinition(id);
      return {
        planId: def.planId,
        marketing_title: def.marketing_title,
        monthlyPriceUsd: def.monthlyPriceUsd ?? 0,
        limits: def.limits,
      };
    });
  }

  @Post('policies/update')
  async updatePolicies(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const updates: Record<string, string> = {
      blockLocalhost: body.blockLocalhost != null ? String(body.blockLocalhost) : undefined,
      blockRfc1918Ip: body.blockRfc1918Ip != null ? String(body.blockRfc1918Ip) : undefined,
      blockMetadataEndpoints: body.blockMetadataEndpoints != null ? String(body.blockMetadataEndpoints) : undefined,
      blockRepeatedTargetScanning: body.blockRepeatedTargetScanning != null ? String(body.blockRepeatedTargetScanning) : undefined,
      enforcePerPlanToolRestrictions: body.enforcePerPlanToolRestrictions != null ? String(body.enforcePerPlanToolRestrictions) : undefined,
      strictExploitModeProOnly: body.strictExploitModeProOnly != null ? String(body.strictExploitModeProOnly) : undefined,
      maxParallelJobsPerPlan: body.maxParallelJobsPerPlan != null ? String(body.maxParallelJobsPerPlan) : undefined,
      maxSubAgentsPerPlan: body.maxSubAgentsPerPlan != null ? String(body.maxSubAgentsPerPlan) : undefined,
      maxToolCallsPerJob: body.maxToolCallsPerJob != null ? String(body.maxToolCallsPerJob) : undefined,
      maxStepsPerConversation: body.maxStepsPerConversation != null ? String(body.maxStepsPerConversation) : undefined,
    };
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      await this.settingsRepo.upsert({ key, value, updatedAt: new Date() }, { conflictPaths: ['key'] });
    }
    await this.adminService.log(adminUser.id, 'policies_update', { resource: 'admin/policies', details: JSON.stringify(body), ipAddress: ip });
    return { ok: true };
  }

  @Get('margin/summary')
  async getMarginSummary() {
    const [revenueRows, costRows, userCount] = await Promise.all([
      this.orderRepo.createQueryBuilder('o').select('COALESCE(SUM(o.amountCents), 0)', 'total').where('o.status = :status', { status: CreditOrderStatus.COMPLETED }).getRawOne<{ total: string }>(),
      this.usageRepo.createQueryBuilder('u').select('SUM(u.costPoints)', 'points').getRawOne<{ points: string }>(),
      this.userRepo.count(),
    ]);
    const totalRevenueCents = parseInt(revenueRows?.total ?? '0', 10);
    const totalRevenue = totalRevenueCents / 100;
    const totalCostPoints = Number(costRows?.points ?? 0);
    const totalAiCost = totalCostPoints * POINTS_TO_USD;
    const grossMarginPct = totalRevenue > 0 ? ((totalRevenue - totalAiCost) / totalRevenue) * 100 : 0;
    const avgCostPerUser = userCount > 0 ? totalAiCost / userCount : 0;
    return {
      totalRevenue: totalRevenue.toFixed(2),
      totalAiCost: totalAiCost.toFixed(2),
      grossMarginPct: grossMarginPct.toFixed(1),
      avgCostPerUser: avgCostPerUser.toFixed(4),
      totalRevenueCents,
      totalAiCostUsd: totalAiCost,
    };
  }

  @Get('margin/users')
  async getMarginUsers(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);
    const [revRaw, costRaw, allUsers] = await Promise.all([
      this.orderRepo.createQueryBuilder('o').select('o.userId', 'userId').addSelect('COALESCE(SUM(o.amountCents), 0)', 'revenueCents').where('o.status = :status', { status: CreditOrderStatus.COMPLETED }).groupBy('o.userId').getRawMany<{ userId: string; revenueCents: string }>(),
      this.usageRepo.createQueryBuilder('u').select('u.userId', 'userId').addSelect('SUM(u.costPoints)', 'costPoints').groupBy('u.userId').getRawMany<{ userId: string; costPoints: string }>(),
      this.userRepo.find({ order: { createdAt: 'DESC' }, select: ['id', 'email', 'planId', 'createdAt'] }),
    ]);
    const revMap = new Map(revRaw.map((r) => [r.userId, Number(r.revenueCents) / 100]));
    const costMap = new Map(costRaw.map((r) => [r.userId, Number(r.costPoints) * POINTS_TO_USD]));
    const total = allUsers.length;
    const usersPage = allUsers.slice(skip, skip + take);
    const items = usersPage.map((u) => {
      const revenue = revMap.get(u.id) ?? 0;
      const aiCost = costMap.get(u.id) ?? 0;
      const marginPct = revenue > 0 ? ((revenue - aiCost) / revenue) * 100 : 0;
      return {
        user: u.email ?? u.id,
        userId: u.id,
        plan: u.planId ?? 'FREE',
        revenue: revenue.toFixed(2),
        aiCost: aiCost.toFixed(4),
        marginPct: marginPct.toFixed(1),
        activeSince: u.createdAt ?? null,
      };
    });
    return { items, total };
  }

  @Post('wipe-chat-and-reports')
  async wipeChatAndReports(@Body() body: { confirm?: string }, @Req() req: Request) {
    if (body?.confirm !== WIPE_CONFIRM_PHRASE) {
      throw new HttpException(
        `Confirmation required. Send body: { "confirm": "${WIPE_CONFIRM_PHRASE}" }`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const user = req.user as any;
    const ip = this.adminService.getClientIp(req);

    const deletedParts = await this.messagePartRepo.delete({});
    const deletedFiles = await this.messageFileRepo.delete({});
    const deletedMessages = await this.messageRepo.delete({});
    const deletedMemory = await this.memoryRepo.delete({});
    const deletedHacktivity = await this.hacktivityRepo.delete({});
    const deletedReports = await this.reportRepo.delete({});
    const deletedConversations = await this.conversationRepo.delete({});

    await this.adminService.log(user.id, 'wipe_chat_and_reports', {
      resource: 'chat,reports,hacktivity',
      details: JSON.stringify({
        messageParts: deletedParts.affected ?? 0,
        messageFiles: deletedFiles.affected ?? 0,
        messages: deletedMessages.affected ?? 0,
        conversationMemory: deletedMemory.affected ?? 0,
        hacktivity: deletedHacktivity.affected ?? 0,
        reports: deletedReports.affected ?? 0,
        conversations: deletedConversations.affected ?? 0,
      }),
      ipAddress: ip,
    });

    return {
      message: 'All chat and report data deleted.',
      deleted: {
        messageParts: deletedParts.affected ?? 0,
        messageFiles: deletedFiles.affected ?? 0,
        messages: deletedMessages.affected ?? 0,
        conversationMemory: deletedMemory.affected ?? 0,
        hacktivity: deletedHacktivity.affected ?? 0,
        reports: deletedReports.affected ?? 0,
        conversations: deletedConversations.affected ?? 0,
      },
    };
  }

  // ─── DB Backup & Restore ────────────────────────────────────────

  @Post('db/backup')
  async createDbBackup(@Req() req: Request) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    const result = await this.dbBackupService.createBackup();

    await this.adminService.log(adminUser.id, 'db_backup_create', {
      resource: result.filename,
      details: JSON.stringify({ size: result.size }),
      ipAddress: ip,
    });

    return { ok: true, ...result };
  }

  @Get('db/backups')
  async listDbBackups() {
    const backups = this.dbBackupService.listBackups();
    return { ok: true, count: backups.length, backups };
  }

  @Post('db/restore/:filename')
  async restoreDbBackup(
    @Param('filename') filename: string,
    @Body() body: { token?: string },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);

    if (!body?.token) {
      // No token — generate one and return it for the admin to confirm
      const { token, expiresAt } = this.dbBackupService.generateRestoreToken(filename);
      await this.adminService.log(adminUser.id, 'db_restore_token_generated', {
        resource: filename,
        details: JSON.stringify({ expiresAt }),
        ipAddress: ip,
      });
      return {
        ok: true,
        requiresConfirmation: true,
        message: 'Send this token in body.token to confirm restore. Token expires in 5 minutes.',
        token,
        expiresAt,
      };
    }

    // Token provided — execute restore
    const result = await this.dbBackupService.restoreBackup(body.token);

    await this.adminService.log(adminUser.id, 'db_restore_executed', {
      resource: result.filename,
      details: JSON.stringify({ message: result.message }),
      ipAddress: ip,
    });

    return { ok: true, ...result };
  }
}
