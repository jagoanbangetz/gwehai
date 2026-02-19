import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../entities/user.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { User } from '../entities/user.entity';
import { AdminSetting } from '../entities/admin-setting.entity';
import { AdminService } from './admin.service';
import { Request } from 'express';

const POINTS_TO_USD = 0.0001; // configurable estimate

@Controller('admin/cost')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCostController {
  constructor(
    @InjectRepository(UsageEvent)
    private readonly usageRepo: Repository<UsageEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AdminSetting)
    private readonly settingsRepo: Repository<AdminSetting>,
    private readonly adminService: AdminService,
  ) {}

  @Get('summary')
  async getSummary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [todayRows, monthRows, totalCalls] = await Promise.all([
      this.usageRepo
        .createQueryBuilder('u')
        .select('SUM(u.inputTokens)', 'input')
        .addSelect('SUM(u.outputTokens)', 'output')
        .addSelect('SUM(u.costPoints)', 'points')
        .where('u.createdAt >= :today', { today: today + 'T00:00:00.000Z' })
        .getRawOne<{ input: string; output: string; points: string }>(),
      this.usageRepo
        .createQueryBuilder('u')
        .select('SUM(u.inputTokens)', 'input')
        .addSelect('SUM(u.outputTokens)', 'output')
        .addSelect('SUM(u.costPoints)', 'points')
        .where('u.createdAt >= :start', { start: startOfMonth + 'T00:00:00.000Z' })
        .getRawOne<{ input: string; output: string; points: string }>(),
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

  @Get('users')
  async getUsers(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('model') model?: string,
    @Query('plan') plan?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);

    let qb = this.usageRepo
      .createQueryBuilder('u')
      .innerJoin('u.user', 'user')
      .select('u.userId', 'userId')
      .addSelect('user.email', 'user_email')
      .addSelect('user.planId', 'user_planId')
      .addSelect('SUM(u.inputTokens)', 'inputTokens')
      .addSelect('SUM(u.outputTokens)', 'outputTokens')
      .addSelect('SUM(u.costPoints)', 'costPoints')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('MAX(u.createdAt)', 'lastActive')
      .groupBy('u.userId')
      .addGroupBy('user.id')
      .addGroupBy('user.email')
      .addGroupBy('user.planId');

    if (dateFrom) {
      qb = qb.andWhere('u.createdAt >= :dateFrom', { dateFrom: dateFrom + 'T00:00:00.000Z' });
    }
    if (dateTo) {
      qb = qb.andWhere('u.createdAt <= :dateTo', { dateTo: dateTo + 'T23:59:59.999Z' });
    }
    if (model) {
      qb = qb.andWhere('u.modelId = :model', { model });
    }
    if (plan) {
      qb = qb.andWhere('(user.planId = :plan OR (user.planId IS NULL AND :plan = \'FREE\'))', { plan });
    }

    const raw = await qb
      .orderBy('MAX(u.createdAt)', 'DESC')
      .skip(skip)
      .take(take)
      .getRawMany();

    const items = raw.map((r) => ({
      user: r.user_email ?? r.userId,
      userId: r.userId,
      plan: r.user_planId ?? 'FREE',
      model: model ?? null,
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      totalCost: (Number(r.costPoints ?? 0) * POINTS_TO_USD).toFixed(4),
      calls: Number(r.calls ?? 0),
      lastActive: r.lastActive,
    }));

    const countQb = this.usageRepo
      .createQueryBuilder('u')
      .innerJoin('u.user', 'user')
      .select('COUNT(DISTINCT u.userId)', 'cnt');
    if (dateFrom) countQb.andWhere('u.createdAt >= :dateFrom', { dateFrom: dateFrom + 'T00:00:00.000Z' });
    if (dateTo) countQb.andWhere('u.createdAt <= :dateTo', { dateTo: dateTo + 'T23:59:59.999Z' });
    if (model) countQb.andWhere('u.modelId = :model', { model });
    if (plan) countQb.andWhere('(user.planId = :plan OR (user.planId IS NULL AND :plan = \'FREE\'))', { plan });
    const totalRow = await countQb.getRawOne<{ cnt: string }>();
    const total = parseInt(totalRow?.cnt ?? '0', 10);

    return { items, total };
  }

  @Get('settings')
  async getSettings() {
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

  @Post('settings')
  async saveSettings(
    @Body()
    body: {
      globalDailyTokenCap?: number;
      globalMonthlyTokenCap?: number;
      perUserTokenCap?: number;
      perPlanTokenCap?: string;
      modelEscalationToggle?: boolean;
    },
    @Req() req: Request,
  ) {
    const adminUser = req.user as { id: string };
    const ip = this.adminService.getClientIp(req);
    const keys = [
      'globalDailyTokenCap',
      'globalMonthlyTokenCap',
      'perUserTokenCap',
      'perPlanTokenCap',
      'modelEscalationToggle',
    ];
    for (const key of keys) {
      const v = (body as any)[key];
      if (v === undefined) continue;
      await this.settingsRepo.upsert(
        { key, value: typeof v === 'object' ? JSON.stringify(v) : String(v), updatedAt: new Date() },
        { conflictPaths: ['key'] },
      );
    }
    await this.adminService.log(adminUser.id, 'cost_settings_update', {
      resource: 'admin/cost/settings',
      details: JSON.stringify(body),
      ipAddress: ip,
    });
    return { ok: true };
  }
}
