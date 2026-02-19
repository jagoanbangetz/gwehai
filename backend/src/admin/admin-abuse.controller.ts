import { Controller, Get, Post, Body, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../entities/user.entity';
import { AbuseEvent } from '../entities/abuse-event.entity';
import { AdminService } from './admin.service';
import { Request } from 'express';

@Controller('admin/abuse')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAbuseController {
  constructor(
    @InjectRepository(AbuseEvent)
    private readonly abuseRepo: Repository<AbuseEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly adminService: AdminService,
  ) {}

  @Get('summary')
  async getSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const [suspiciousToday, rateLimitViolations, repeatedTargets, highVelocity] = await Promise.all([
      this.abuseRepo
        .createQueryBuilder('a')
        .select('COUNT(DISTINCT a.userId)', 'c')
        .where('a.createdAt >= :today', { today: today + 'T00:00:00.000Z' })
        .andWhere('a.riskScore >= 50')
        .getRawOne<{ c: string }>(),
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

  @Get('events')
  async getEvents(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    const skip = Math.max(0, parseInt(offset || '0', 10) || 0);
    const [items, total] = await this.abuseRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
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

  @Post('action')
  async postAction(
    @Body() body: { userId: string; action: 'throttle' | 'suspend' | 'ban'; reason?: string },
    @Req() req: Request,
  ) {
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
    await this.adminService.log(adminUser.id, `abuse_${body.action}`, {
      resource: body.userId,
      details: JSON.stringify({ reason: body.reason, email: user.email }),
      ipAddress: ip,
    });
    return { ok: true, action: body.action };
  }
}
