import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Hacktivity } from '../entities/hacktivity.entity';
import { Conversation } from '../entities/conversation.entity';

const MAX_RESULT_LENGTH = 16000;

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
    const result =
      data.result.length > MAX_RESULT_LENGTH
        ? data.result.slice(0, MAX_RESULT_LENGTH) + '\n...[truncated]'
        : data.result;
    const row = this.hacktivityRepo.create({
      userId,
      conversationId: data.conversationId ?? null,
      domain: data.domain ?? null,
      result,
      toolArgs: data.toolArgs ?? null,
    });
    return this.hacktivityRepo.save(row);
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
   */
  async listConversations(userId: string): Promise<HacktivityConversationRow[]> {
    const raw = await this.hacktivityRepo
      .createQueryBuilder('h')
      .select('h.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .where('h.userId = :userId', { userId })
      .andWhere('h.conversationId IS NOT NULL')
      .groupBy('h.conversationId')
      .orderBy('count', 'DESC')
      .getRawMany<{ conversationId: string; count: string }>();
    if (raw.length === 0) return [];
    const ids = raw.map((r) => r.conversationId);
    const convs = await this.conversationRepo.find({
      where: { id: In(ids), userId },
      select: { id: true, title: true },
    });
    const titleBy = new Map(convs.map((c) => [c.id, c.title ?? null]));
    return raw.map((r) => ({
      conversationId: r.conversationId,
      title: titleBy.get(r.conversationId) ?? null,
      count: Number(r.count),
    }));
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
}
