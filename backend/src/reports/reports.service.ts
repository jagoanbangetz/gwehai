import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Report, ReportStatus } from '../entities/report.entity';
import { Conversation } from '../entities/conversation.entity';
import { PentestJob } from '../entities/pentest-job.entity';
import { stripAnsi } from '../utils/ansi.util';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(PentestJob)
    private readonly pentestJobRepo: Repository<PentestJob>,
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

  /** Extract domain (hostname) from target URL for grouping. e.g. https://example.com/path -> example.com */
  private extractDomain(target: string | null | undefined): string {
    if (!target || !target.trim()) return '—';
    const t = target.trim();
    try {
      const u = new URL(t.startsWith('http') ? t : `https://${t}`);
      return u.hostname || '—';
    } catch {
      return t;
    }
  }

  /**
   * List reports grouped by unique (domain, conversationId, date). One row per domain + conversation + date.
   * date is YYYY-MM-DD from createdAt. Returns conversationId so the UI can show it as unique identifier.
   */
  async listGroupedByDomainAndDate(
    userId: string,
  ): Promise<
    { domain: string; date: string; conversationId: string | null; findingsCount: number; createdAt: string; firstAt: string; lastAt: string }[]
  > {
    const reports = await this.reportRepo.find({
      where: { userId, status: ReportStatus.COMPLETED },
      order: { createdAt: 'DESC' },
      select: ['id', 'target', 'createdAt', 'conversationId'],
    });
    const sep = '|';
    const map = new Map<string, { count: number; firstAt: Date; lastAt: Date; conversationId: string | null }>();
    for (const r of reports) {
      const domain = this.extractDomain(r.target);
      const convId = r.conversationId ?? null;
      const d = r.createdAt;
      const date = d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` : '—';
      const key = [domain, convId ?? '—', date].join(sep);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { count: 1, firstAt: d, lastAt: d, conversationId: convId });
      } else {
        existing.count += 1;
        if (d < existing.firstAt) existing.firstAt = d;
        if (d > existing.lastAt) existing.lastAt = d;
      }
    }
    let result = Array.from(map.entries())
      .map(([key, v]) => {
        const parts = key.split(sep);
        const domain = parts[0] ?? '—';
        const conversationId = parts[1] === '—' ? null : (parts[1] ?? null);
        const date = parts[2] ?? '—';
        return {
          domain: domain || '—',
          date: date || '—',
          conversationId,
          findingsCount: v.count,
          createdAt: v.lastAt.toISOString(),
          firstAt: v.firstAt.toISOString(),
          lastAt: v.lastAt.toISOString(),
        };
      })
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    // When domain is "—" (report target was null), try to derive from pentest job for this conversation
    const convIdsNeedingDomain = [...new Set(result.filter((r) => (r.domain === '—' || !r.domain) && r.conversationId).map((r) => r.conversationId!))];
    if (convIdsNeedingDomain.length > 0) {
      const jobs = await this.pentestJobRepo.find({
        where: { userId, conversationId: In(convIdsNeedingDomain) },
        select: ['conversationId', 'targetBaseUrl'],
      });
      const convToDomain = new Map<string, string>();
      for (const j of jobs) {
        if (j.conversationId && j.targetBaseUrl) {
          const d = this.extractDomain(j.targetBaseUrl);
          if (d !== '—') convToDomain.set(j.conversationId, d);
        }
      }
      result = result.map((r) => {
        if ((r.domain === '—' || !r.domain) && r.conversationId) {
          const derived = convToDomain.get(r.conversationId);
          if (derived) return { ...r, domain: derived };
        }
        return r;
      });
    }

    return result;
  }

  /** List all findings for a given domain + date group; optionally filter by conversationId. */
  async listFindingsByDomainAndDate(
    userId: string,
    domain: string,
    date: string,
    conversationId?: string | null,
  ): Promise<Report[]> {
    const reports = await this.reportRepo.find({
      where: { userId, status: ReportStatus.COMPLETED },
      order: { createdAt: 'DESC' },
    });
    const dateNorm = date.trim();
    const convNorm = conversationId?.trim() || null;
    return reports.filter((r) => {
      const d = this.extractDomain(r.target);
      const rDate = r.createdAt
        ? `${r.createdAt.getUTCFullYear()}-${String(r.createdAt.getUTCMonth() + 1).padStart(2, '0')}-${String(r.createdAt.getUTCDate()).padStart(2, '0')}`
        : '—';
      const domainMatch = (domain === '—' && (d === '—' || !d)) || d === domain;
      const dateMatch = rDate === dateNorm;
      const convMatch = convNorm == null || (r.conversationId === convNorm);
      return domainMatch && dateMatch && convMatch;
    });
  }

  /** Save a bug/finding from the pentest agent into the reports table (user_id, conversation_id, detail, poc). Dedup: by (conversationId, detail, target, poc) and by finding_key when provided. */
  async createFinding(
    userId: string,
    conversationId: string,
    detail: string,
    options?: { title?: string; severity?: string; target?: string; poc?: string; finding_key?: string; confidence?: number; confidence_reason?: string; confidence_label?: string },
  ) {
    const { randomUUID } = await import('crypto');

    // Strip ANSI escape codes from tool output, then normalize whitespace
    const normalizedDetail = stripAnsi(detail).replace(/\s+/g, ' ').trim();
    const normalizedTarget = this.normalizeReportTarget(options?.target ?? null);
    const normalizedPoc = options?.poc ? stripAnsi(options.poc).replace(/\s+/g, ' ').trim() : null;
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
        ...(options?.confidence != null && { confidence: options.confidence }),
        ...(options?.confidence_reason != null && { confidence_reason: options.confidence_reason }),
        ...(options?.confidence_label != null && { confidence_label: options.confidence_label }),
      },
      startedAt: null,
      finishedAt: null,
    });
    return this.reportRepo.save(report);
  }

  /**
   * List reports grouped by conversation (or by parent run when groupByParent).
   * When groupByParent: one row per "run" (main conversation); sub-agent findings are rolled up so one run = one row.
   */
  async listGroupedByConversation(
    userId: string,
    options?: { groupByParent?: boolean },
  ): Promise<
    { conversationId: string; website: string; findingsCount: number; createdAt: string; runStatus: string; startedAt: string | null; finishedAt: string | null }[]
  > {
    const groupByParent = options?.groupByParent === true;
    const rootExpr = groupByParent ? 'COALESCE(c."parentConversationId", c.id)' : 'r."conversationId"';

    const qb = this.reportRepo
      .createQueryBuilder('r')
      .select(rootExpr, 'conversationId')
      .addSelect('MAX(r.target)', 'website')
      .addSelect('COUNT(r.id)', 'findingsCount')
      .addSelect('MAX(r.createdAt)', 'createdAt')
      .addSelect('COALESCE(MAX(CASE WHEN c."parentConversationId" IS NULL THEN c."runStatus" END), \'finished\')', 'runStatus')
      .addSelect('MIN(c."createdAt")', 'startedAt')
      .addSelect('MAX(c."updatedAt")', 'finishedAt')
      .leftJoin(Conversation, 'c', 'c.id = r.conversationId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.conversationId IS NOT NULL');

    if (groupByParent) {
      qb.groupBy(rootExpr);
    } else {
      qb.groupBy('r.conversationId').addGroupBy('c."runStatus"');
    }
    qb.orderBy('MAX(r.createdAt)', 'DESC');

    const rows = await qb.getRawMany();
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

  /** List all findings for a "run": main conversation + all sub-agent conversations (when groupByParent was used). */
  async listFindingsByRun(userId: string, rootConversationId: string) {
    const convs = await this.reportRepo.manager.find(Conversation, {
      where: [
        { id: rootConversationId, userId },
        { parentConversationId: rootConversationId, userId },
      ],
      select: ['id'],
    });
    const ids = convs.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) return [];
    return this.reportRepo.find({
      where: { userId, status: ReportStatus.COMPLETED, conversationId: ids.length === 1 ? ids[0] : In(ids) },
      order: { createdAt: 'DESC' },
    });
  }

  /** List reports as tree: runs with agents (children) and findings count per agent. */
  async listReportsTree(
    userId: string,
  ): Promise<
    {
      conversationId: string;
      website: string;
      findingsCount: number;
      createdAt: string;
      runStatus: string;
      startedAt: string | null;
      finishedAt: string | null;
      agents: { conversationId: string; agentRole: string | null; findingsCount: number }[];
    }[]
  > {
    const runs = await this.listGroupedByConversation(userId, { groupByParent: true });
    const out: {
      conversationId: string;
      website: string;
      findingsCount: number;
      createdAt: string;
      runStatus: string;
      startedAt: string | null;
      finishedAt: string | null;
      agents: { conversationId: string; agentRole: string | null; findingsCount: number }[];
    }[] = [];
    for (const run of runs) {
      const agents = await this.getRunAgents(userId, run.conversationId);
      out.push({
        ...run,
        agents,
      });
    }
    return out;
  }

  /** Per-run agents (main + sub-agents) with findings count. */
  private async getRunAgents(
    userId: string,
    rootConversationId: string,
  ): Promise<{ conversationId: string; agentRole: string | null; findingsCount: number }[]> {
    const rows = await this.reportRepo
      .createQueryBuilder('r')
      .select('c.id', 'conversationId')
      .addSelect('c.agentRole', 'agentRole')
      .addSelect('COUNT(r.id)', 'findingsCount')
      .innerJoin(Conversation, 'c', 'c.id = r.conversationId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status = :status', { status: ReportStatus.COMPLETED })
      .andWhere('(c.id = :root OR c.parentConversationId = :root)', { root: rootConversationId })
      .groupBy('c.id')
      .addGroupBy('c.agentRole')
      .orderBy('COUNT(r.id)', 'DESC')
      .getRawMany();
    return rows.map((r) => ({
      conversationId: r.conversationId,
      agentRole: r.agentRole ?? null,
      findingsCount: Number(r.findingsCount),
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

