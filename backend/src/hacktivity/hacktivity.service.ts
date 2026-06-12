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
   * Record one AI tool action. Called from ChatService after each tool run.
   */
  async create(
    userId: string,
    data: {
      conversationId?: string | null;
      domain?: string | null;
      result: string;
      toolArgs?: Record<string, any> | null;
    },
  ): Promise<Hacktivity> {
    // Strip ANSI escape codes from terminal output before saving to DB
    const cleanResult = stripAnsi(data.result ?? '');
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
