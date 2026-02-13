import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from '../entities/report.entity';
import { Conversation } from '../entities/conversation.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
  ) {}

  async listReportsForUser(userId: string) {
    return this.reportRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getReportForUser(userId: string, id: string) {
    const report = await this.reportRepo.findOne({ where: { id, userId } });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  async createReportForUser(userId: string, data: {
    jobId: string;
    target?: string;
    status?: ReportStatus;
    fileUrl?: string;
    metadata?: Record<string, any>;
  }) {
    const report = this.reportRepo.create({
      userId,
      jobId: data.jobId,
      conversationId: null,
      detail: null,
      target: data.target || null,
      status: data.status || ReportStatus.QUEUED,
      fileUrl: data.fileUrl || null,
      metadata: data.metadata || null,
      startedAt: null,
      finishedAt: null,
    });
    return this.reportRepo.save(report);
  }

  /**
   * Normalize report target URL: one URL = one report context.
   * When the input is a root URL (no path or path is '/'), store origin only (no path).
   */
  private normalizeReportTarget(target: string | null | undefined): string | null {
    if (!target || !target.trim()) return null;
    const t = target.trim();
    try {
      const u = new URL(t.startsWith('http') ? t : `https://${t}`);
      const pathname = u.pathname || '/';
      if (pathname === '/' || pathname === '') {
        return u.origin;
      }
      return u.origin + u.pathname + u.search;
    } catch {
      return t;
    }
  }

  /** Save a bug/finding from the pentest agent into the reports table (user_id, conversation_id, detail, poc). Dedup: by (conversationId, detail, target, poc) and by finding_key when provided. */
  async createFinding(
    userId: string,
    conversationId: string,
    detail: string,
    options?: { title?: string; severity?: string; target?: string; poc?: string; finding_key?: string },
  ) {
    const { randomUUID } = await import('crypto');

    // Normalize fields so logically identical findings map to the same key.
    const normalizedDetail = detail.replace(/\s+/g, ' ').trim();
    const normalizedTarget = this.normalizeReportTarget(options?.target ?? null);
    const normalizedPoc = options?.poc ? options.poc.replace(/\s+/g, ' ').trim() : null;
    const findingKey = options?.finding_key ? String(options.finding_key).trim() : null;

    // Dedup 1: by finding_key (e.g. category|endpoint|param|impact) when provided — one finding per key per conversation.
    if (findingKey) {
      const byKey = await this.reportRepo
        .createQueryBuilder('r')
        .where('r.userId = :userId', { userId })
        .andWhere('r.conversationId = :conversationId', { conversationId })
        .andWhere('r.status = :status', { status: ReportStatus.COMPLETED })
        .andWhere("r.metadata->>'finding_key' = :key", { key: findingKey })
        .getOne();
      if (byKey) return byKey;
    }

    // Dedup 2: by normalized (detail, target, poc) per user + conversation — identical content = same finding.
    const existing = await this.reportRepo.findOne({
      where: {
        userId,
        conversationId,
        status: ReportStatus.COMPLETED,
        detail: normalizedDetail,
        target: normalizedTarget,
        poc: normalizedPoc,
      },
    });
    if (existing) {
      return existing;
    }

    const report = this.reportRepo.create({
      userId,
      conversationId,
      detail: normalizedDetail,
      poc: normalizedPoc,
      jobId: `finding_${randomUUID()}`,
      target: normalizedTarget,
      status: ReportStatus.COMPLETED,
      fileUrl: null,
      metadata: {
        ...(options?.title != null && { title: options.title }),
        ...(options?.severity != null && { severity: options.severity }),
        ...(findingKey != null && { finding_key: findingKey }),
      },
      startedAt: null,
      finishedAt: null,
    });
    return this.reportRepo.save(report);
  }

  /** List reports grouped by conversation: one row per conversation with website, findings count, start/end times. */
  async listGroupedByConversation(userId: string): Promise<
    { conversationId: string; website: string; findingsCount: number; createdAt: string; runStatus: string; startedAt: string | null; finishedAt: string | null }[]
  > {
    const rows = await this.reportRepo
      .createQueryBuilder('r')
      .select('r.conversationId', 'conversationId')
      .addSelect('MAX(r.target)', 'website')
      .addSelect('COUNT(r.id)', 'findingsCount')
      .addSelect('MAX(r.createdAt)', 'createdAt')
      .addSelect('COALESCE(c."runStatus", \'finished\')', 'runStatus')
      .addSelect('MIN(c."createdAt")', 'startedAt')
      .addSelect('MAX(c."updatedAt")', 'finishedAt')
      .leftJoin(Conversation, 'c', 'c.id = r.conversationId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.conversationId IS NOT NULL')
      .groupBy('r.conversationId')
      .addGroupBy('c."runStatus"')
      .orderBy('MAX(r.createdAt)', 'DESC')
      .getRawMany();
    return rows.map((r) => ({
      conversationId: r.conversationId,
      website: r.website || '—',
      findingsCount: Number(r.findingsCount),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      runStatus: String(r.runStatus || 'finished'),
      startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : (r.startedAt ? String(r.startedAt) : null),
      finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : (r.finishedAt ? String(r.finishedAt) : null),
    }));
  }

  /** List all findings (report rows) for a conversation. */
  async listFindingsByConversation(userId: string, conversationId: string) {
    return this.reportRepo.find({
      where: { userId, conversationId, status: ReportStatus.COMPLETED },
      order: { createdAt: 'DESC' },
    });
  }

  async updateReportStatus(jobId: string, partial: Partial<Report>) {
    const report = await this.reportRepo.findOne({ where: { jobId } });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    Object.assign(report, partial);
    return this.reportRepo.save(report);
  }
}

