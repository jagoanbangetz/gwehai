import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepo: Repository<AdminAuditLog>,
  ) {}

  /**
   * Log an admin action for audit. Call this on every sensitive admin action.
   */
  async log(
    adminUserId: string,
    action: string,
    options?: { resource?: string; details?: string; ipAddress?: string | null },
  ): Promise<void> {
    const log = this.auditRepo.create({
      adminUserId,
      action,
      resource: options?.resource ?? null,
      details: options?.details ?? null,
      ipAddress: options?.ipAddress ?? null,
    });
    await this.auditRepo.save(log);
  }

  /**
   * Get client IP from Express request (handles proxies).
   */
  getClientIp(req: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string | null {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return first?.split(',')[0]?.trim() ?? null;
    }
    return (req.socket as any)?.remoteAddress ?? null;
  }

  async getAuditLogs(options: { limit?: number; offset?: number; action?: string; adminUserId?: string }) {
    const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
    const offset = Math.max(0, options.offset ?? 0);
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .skip(offset)
      .take(limit);
    if (options.action) {
      qb.andWhere('a.action = :action', { action: options.action });
    }
    if (options.adminUserId) {
      qb.andWhere('a.adminUserId = :adminUserId', { adminUserId: options.adminUserId });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
