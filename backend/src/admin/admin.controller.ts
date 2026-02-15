import { Controller, Get, Post, Body, Query, Param, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../entities/user.entity';
import { Model } from '../entities/model.entity';
import { CreditOrder } from '../entities/credit-order.entity';
import { Report } from '../entities/report.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Message } from '../entities/message.entity';
import { MessagePart } from '../entities/message-part.entity';
import { MessageFile } from '../entities/message-file.entity';
import { Conversation } from '../entities/conversation.entity';
import { ConversationMemory } from '../entities/conversation-memory.entity';
import { Hacktivity } from '../entities/hacktivity.entity';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { GwehAIService } from '../gwehai/gwehai.service';

const WIPE_CONFIRM_PHRASE = 'WIPE_ALL_DATA';

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
    private readonly adminService: AdminService,
    private readonly gwehaiService: GwehAIService,
  ) {}

  @Get('dashboard')
  async getDashboardSummary() {
    const [userCount, adminCount, modelCount, orderCount, reportCount, conversationCount, hacktivityCount] =
      await Promise.all([
        this.userRepo.count(),
        this.userRepo.count({ where: { role: UserRole.ADMIN } }),
        this.modelRepo.count(),
        this.orderRepo.count(),
        this.reportRepo.count(),
        this.conversationRepo.count(),
        this.hacktivityRepo.count(),
      ]);

    const activeJobs = this.gwehaiService.getActiveJobsForAdmin();
    const recentActivity = await this.usageRepo.find({
      order: { createdAt: 'DESC' as any },
      take: 20,
      relations: ['user', 'model'],
    });

    return {
      users: userCount,
      admins: adminCount,
      aiAgents: modelCount,
      payments: orderCount,
      reports: reportCount,
      conversations: conversationCount,
      hacktivityTotal: hacktivityCount,
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

  @Get('usage-summary')
  async getUsageSummary() {
    const [usageByUser, totalUsage] = await Promise.all([
      this.usageRepo
        .createQueryBuilder('u')
        .select('u.userId', 'userId')
        .addSelect('SUM(u.inputTokens)', 'inputTokens')
        .addSelect('SUM(u.outputTokens)', 'outputTokens')
        .addSelect('COUNT(*)', 'calls')
        .groupBy('u.userId')
        .orderBy('calls', 'DESC')
        .limit(100)
        .getRawMany(),
      this.usageRepo
        .createQueryBuilder('u')
        .select('SUM(u.inputTokens)', 'inputTokens')
        .addSelect('SUM(u.outputTokens)', 'outputTokens')
        .addSelect('COUNT(*)', 'calls')
        .getRawOne(),
    ]);
    return { byUser: usageByUser, total: totalUsage };
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
    });
    return { items, total };
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

  @Get('settings')
  async getSettings(@Req() req: Request) {
    return {
      environment: process.env.NODE_ENV || 'development',
      apiBaseUrl: process.env.API_BASE_URL || '/api',
    };
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
}
