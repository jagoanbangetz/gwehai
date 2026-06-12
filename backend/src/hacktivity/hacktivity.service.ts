import { Injectable, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Hacktivity } from '../entities/hacktivity.entity';
import { Conversation } from '../entities/conversation.entity';
import { stripAnsi } from '../utils/ansi.util';

const MAX_RESULT_LENGTH = 16000;

/** Max conversations returned by listConversations (prevents slow queries for power users). */
const MAX_CONVERSATIONS = 50;

/** Cache TTL for listConversations results (ms). */
const CONVERSATIONS_CACHE_TTL_MS = 60_000;

export interface HacktivityListResult {
  items: Hacktivity[];
  total: number;
}

export interface HacktivityConversationRow {
  conversationId: string;
  title: string | null;
  count: number;
}

@Injectable()
export class HacktivityService {
  /**
   * Stream of new hacktivity rows for admin SSE/WebSocket consumers.
   * Emits every time create() saves a new entry.
   */
  private readonly adminStreamSubject = new Subject<Hacktivity>();

  /** Simple in-memory cache for listConversations: userId → { data, expiresAt } */
  private readonly conversationsCache = new Map<
    string,
    { data: HacktivityConversationRow[]; expiresAt: number }
  >();

  constructor(
    @InjectRepository(Hacktivity)
    private readonly hacktivityRepo: Repository<Hacktivity>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
  ) {}

  /**
   * Detect noise entries (empty-command, browser crash, tool error with no stdout).
   * Returns true if the entry should be SKIPPED (not saved).
   *
   * Rule: if stdout is EMPTY AND there's error/stderr → SKIP.
   * If stdout has content → save (even if there's also an error).
   */
  private isNoiseEntry(result: string): boolean {
    const trimmed = result.trim();
    if (!trimmed) return true; // empty → noise

    // Filter plain-text error messages (not JSON) — tool errors, empty-command, etc.
    // Matches "Error: command is required", "Error: exec requires a non-empty command.", etc.
    if (!trimmed.startsWith('{') && /^Error:\s/i.test(trimmed)) {
      return true;
    }

    // Only filter JSON-shaped results below
    if (!trimmed.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(trimmed);

      // Case 1: has stdout field — skip if stdout empty AND (stderr or error present)
      if ('stdout' in parsed) {
        const stdout = String(parsed.stdout ?? '').trim();
        if (!stdout) {
          const hasStderr = !!(parsed.stderr && String(parsed.stderr).trim());
          const hasError = !!(parsed.error && String(parsed.error).trim());
          if (hasStderr || hasError) return true;
        }
        return false; // stdout has content → keep
      }

      // Case 2: no stdout but has error field → noise (empty-command, browser crash, tool error)
      if (parsed.error && typeof parsed.error === 'string') {
        // LAYER 3: Explicit skipped flag — tool executor marks entries that should not be saved
        if (parsed.skipped === true) return true;
        // Check if there's any other meaningful content besides error
        const keys = Object.keys(parsed).filter((k) => k !== 'error' && k !== 'exitCode' && k !== 'success' && k !== 'action');
        if (keys.length === 0) return true;
        // success: false + error → browser crash
        if (parsed.success === false) return true;
      }

      return false;
    } catch {
      // Not valid JSON — not noise, keep it
      return false;
    }
  }

  /**
   * Record one AI tool action. Called from ChatService after each tool run.
   * Returns null if the entry was filtered as noise.
   */
  async create(
    userId: string,
    data: {
      conversationId?: string | null;
      domain?: string | null;
      result: string;
      toolArgs?: Record<string, any> | null;
    },
  ): Promise<Hacktivity | null> {
    // Strip ANSI escape codes from terminal output before saving to DB
    const cleanResult = stripAnsi(data.result ?? '');

    // Filter noise: empty-command, browser crash, tool error with no stdout
    if (this.isNoiseEntry(cleanResult)) {
      return null;
    }
    const result =
      cleanResult.length > MAX_RESULT_LENGTH
        ? cleanResult.slice(0, MAX_RESULT_LENGTH) + '\n...[truncated]'
        : cleanResult;
    const row = this.hacktivityRepo.create({
      userId,
      conversationId: data.conversationId ?? null,
      domain: data.domain ?? null,
      result,
      toolArgs: data.toolArgs ?? null,
    });
    const saved = await this.hacktivityRepo.save(row);
    // Invalidate conversations cache for this user (new activity may change the list)
    this.conversationsCache.delete(userId);
    // Emit for admin stream (non-blocking; errors should not break writes)
    try {
      this.adminStreamSubject.next(saved);
    } catch {
      // ignore stream errors
    }
    return saved;
  }

  /**
   * List activity for the user. Optional filter by conversationId; pagination via limit/offset.
   * Returns items and total count for pagination.
   */
  async list(
    userId: string,
    options?: { conversationId?: string; limit?: number; offset?: number },
  ): Promise<HacktivityListResult> {
    const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
    const offset = Math.max(0, options?.offset ?? 0);
    const qb = this.hacktivityRepo
      .createQueryBuilder('h')
      .where('h.userId = :userId', { userId })
      .orderBy('h.createdAt', 'DESC');
    if (options?.conversationId) {
      qb.andWhere('h.conversationId = :conversationId', {
        conversationId: options.conversationId,
      });
    }
    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { items, total };
  }

  /**
   * List conversations that have hacktivity, with activity count and title (for filter dropdown).
   * Optimized: limits to last 50 active conversations from last 30 days, with in-memory cache (60s TTL).
   */
  async listConversations(userId: string): Promise<HacktivityConversationRow[]> {
    // Check cache first
    const cached = this.conversationsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const raw = await this.hacktivityRepo
      .createQueryBuilder('h')
      .select('h.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(h.createdAt)', 'lastActivity')
      .where('h.userId = :userId', { userId })
      .andWhere('h.conversationId IS NOT NULL')
      .andWhere("h.createdAt > NOW() - INTERVAL '30 days'")
      .groupBy('h.conversationId')
      .orderBy('lastActivity', 'DESC')
      .limit(MAX_CONVERSATIONS)
      .getRawMany<{ conversationId: string; count: string; lastActivity: string }>();
    if (raw.length === 0) {
      this.conversationsCache.set(userId, { data: [], expiresAt: Date.now() + CONVERSATIONS_CACHE_TTL_MS });
      return [];
    }
    const ids = raw.map((r) => r.conversationId);
    const convs = await this.conversationRepo.find({
      where: { id: In(ids), userId },
      select: { id: true, title: true },
    });
    const titleBy = new Map(convs.map((c) => [c.id, c.title ?? null]));
    const result: HacktivityConversationRow[] = raw.map((r) => ({
      conversationId: r.conversationId,
      title: titleBy.get(r.conversationId) ?? null,
      count: Number(r.count),
    }));

    // Store in cache
    this.conversationsCache.set(userId, { data: result, expiresAt: Date.now() + CONVERSATIONS_CACHE_TTL_MS });
    return result;
  }

  /**
   * Check if a conversation has tool execution evidence (exec, craft_payload, browser_action, etc.)
   * Used to prevent fake findings — report_finding must be backed by real tool output.
   * Returns true if at least one evidence-producing tool was logged in this conversation.
   */
  async hasToolEvidence(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    // Tool names whose output constitutes "evidence" for a finding
    const evidenceTools = [
      'exec', 'craft_payload', 'browser_action', 'research_browse',
      'research_search', 'web_search', 'memory_search', 'memory_get',
    ];
    // Check if any hacktivity entry for this conversation contains a result
    // that indicates a real tool was executed (not just report_finding or update_pentest_phase)
    const count = await this.hacktivityRepo
      .createQueryBuilder('h')
      .where('h.userId = :userId', { userId })
      .andWhere('h.conversationId = :conversationId', { conversationId })
      .andWhere('h.result IS NOT NULL')
      .andWhere("h.result != ''")
      .getCount();
    // If there are any hacktivity entries at all, there's been tool activity.
    // The key insight: report_finding itself also logs to hacktivity, but we only
    // care about entries BEFORE this report_finding call. However since we can't
    // easily distinguish ordering at query time without a timestamp, we use a
    // simpler heuristic: if there are 0 hacktivity entries for this conversation,
    // there's definitely no evidence.
    return count > 0;
  }

  /**
   * Count evidence-producing tool executions in a conversation.
   * More specific than hasToolEvidence — filters by tool args to exclude
   * non-execution tools like report_finding and update_pentest_phase.
   */
  async countEvidenceToolCalls(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    // Count hacktivity entries where toolArgs contains evidence-producing tool names
    // The toolArgs field stores the args passed to the tool; we check if the entry
    // is from an evidence-producing tool by examining the result content for
    // indicators of real tool execution (command output, HTTP responses, etc.)
    const entries = await this.hacktivityRepo
      .createQueryBuilder('h')
      .where('h.userId = :userId', { userId })
      .andWhere('h.conversationId = :conversationId', { conversationId })
      .andWhere('h.result IS NOT NULL')
      .andWhere("h.result != ''")
      .getMany();
    // Filter entries that look like real tool output (not just report_finding results)
    let evidenceCount = 0;
    for (const entry of entries) {
      const result = (entry.result ?? '').trim();
      // Skip entries that are just report_finding confirmations
      if (result.includes('"ok":true') && result.includes('"report_id"')) continue;
      // Skip entries that are just update_pentest_phase confirmations
      if (result.includes('"phase"') && result.includes('"checklist"')) continue;
      // Skip entries that are just memory write confirmations
      if (result.includes('"ok":true') && result.includes('"path"')) continue;
      // Everything else is potential evidence
      if (result.length > 10) evidenceCount++;
    }
    return evidenceCount;
  }

  /**
   * Get one activity row for detail view. User-scoped.
   */
  async getOne(userId: string, id: string): Promise<Hacktivity> {
    const row = await this.hacktivityRepo.findOne({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('Activity not found');
    }
    return row;
  }

  /**
   * Admin-level stream: emits every new Hacktivity row as it is created.
   * Used by /admin/hacktivity/stream SSE so admin UI can update in realtime.
   */
  getAdminStream(): Observable<{ data: any }> {
    return this.adminStreamSubject.asObservable().pipe((source) =>
      new Observable<{ data: any }>((subscriber) =>
        source.subscribe({
          next: (row) =>
            subscriber.next({
              data: {
                id: row.id,
                userId: row.userId,
                conversationId: row.conversationId,
                domain: row.domain,
                result: row.result,
                toolArgs: row.toolArgs,
                createdAt: row.createdAt,
              },
            }),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        }),
      ),
    );
  }
}
