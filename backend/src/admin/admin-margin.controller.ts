import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../entities/user.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { User } from '../entities/user.entity';
import { CreditOrder, CreditOrderStatus } from '../entities/credit-order.entity';

const POINTS_TO_USD = 0.0001;

@Controller('admin/margin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMarginController {
  constructor(
    @InjectRepository(UsageEvent)
    private readonly usageRepo: Repository<UsageEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CreditOrder)
    private readonly orderRepo: Repository<CreditOrder>,
  ) {}

  @Get('summary')
  async getSummary() {
    const [revenueRows, costRows, userCount] = await Promise.all([
      this.orderRepo
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.amountCents), 0)', 'total')
        .where('o.status = :status', { status: CreditOrderStatus.COMPLETED })
        .getRawOne<{ total: string }>(),
      this.usageRepo
        .createQueryBuilder('u')
        .select('SUM(u.costPoints)', 'points')
        .getRawOne<{ points: string }>(),
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

  @Get('users')
  async getUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);

    const revQb = this.orderRepo
      .createQueryBuilder('o')
      .select('o.userId', 'userId')
      .addSelect('COALESCE(SUM(o.amountCents), 0)', 'revenueCents')
      .where('o.status = :status', { status: CreditOrderStatus.COMPLETED })
      .groupBy('o.userId');
    const revRaw = await revQb.getRawMany<{ userId: string; revenueCents: string }>();
    const costQb = this.usageRepo
      .createQueryBuilder('u')
      .select('u.userId', 'userId')
      .addSelect('SUM(u.costPoints)', 'costPoints')
      .groupBy('u.userId');
    const costRaw = await costQb.getRawMany<{ userId: string; costPoints: string }>();
    const revMap = new Map(revRaw.map((r) => [r.userId, Number(r.revenueCents) / 100]));
    const costMap = new Map(costRaw.map((r) => [r.userId, Number(r.costPoints) * POINTS_TO_USD]));

    const allUserIds = [...new Set([...revMap.keys(), ...costMap.keys()])];
    const userIds = allUserIds.slice(skip, skip + take);
    const users = userIds.length
      ? await this.userRepo.find({
          where: userIds.map((id) => ({ id: id })),
          select: ['id', 'email', 'planId', 'createdAt'],
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = userIds.map((userId) => {
      const u = userMap.get(userId);
      const revenue = revMap.get(userId) ?? 0;
      const aiCost = costMap.get(userId) ?? 0;
      const marginPct = revenue > 0 ? ((revenue - aiCost) / revenue) * 100 : 0;
      return {
        user: u?.email ?? userId,
        userId,
        plan: u?.planId ?? 'FREE',
        revenue: revenue.toFixed(2),
        aiCost: aiCost.toFixed(4),
        marginPct: marginPct.toFixed(1),
        activeSince: u?.createdAt ?? null,
      };
    });

    return { items, total: allUserIds.length };
  }
}
