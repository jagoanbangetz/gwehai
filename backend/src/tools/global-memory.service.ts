import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { GlobalMemory, GlobalMemoryCategory } from '../entities/global-memory.entity';

export interface GlobalMemorySearchResult {
  id: string;
  category: GlobalMemoryCategory;
  key: string;
  value: Record<string, any>;
  confidence: number;
  hitCount: number;
  lastUsedAt: Date | null;
  relevance: number;
}

@Injectable()
export class GlobalMemoryService {
  constructor(
    @InjectRepository(GlobalMemory)
    private readonly repo: Repository<GlobalMemory>,
  ) {}

  /**
   * Search across all categories by keyword.
   * Matches against key and JSON value text.
   */
  async search(
    query: string,
    category?: GlobalMemoryCategory,
    maxResults: number = 20,
  ): Promise<GlobalMemorySearchResult[]> {
    if (!query || !query.trim()) {
      throw new BadRequestException('query is required');
    }

    const qb = this.repo.createQueryBuilder('gm');
    const needle = `%${query.toLowerCase()}%`;

    if (category) {
      qb.where('gm.category = :category', { category });
      qb.andWhere(
        '(LOWER(gm.key) LIKE :needle OR LOWER(gm.value::text) LIKE :needle)',
        { needle },
      );
    } else {
      qb.where(
        '(LOWER(gm.key) LIKE :needle OR LOWER(gm.value::text) LIKE :needle)',
        { needle },
      );
    }

    qb.orderBy('gm.confidence', 'DESC')
      .addOrderBy('gm.hitCount', 'DESC')
      .limit(maxResults);

    const rows = await qb.getMany();

    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      key: r.key,
      value: r.value,
      confidence: r.confidence,
      hitCount: r.hitCount,
      lastUsedAt: r.lastUsedAt,
      relevance: this.computeRelevance(query, r.key, r.value),
    }));
  }

  /**
   * Get entries by category, sorted by confidence and hit count.
   */
  async getByCategory(
    category: GlobalMemoryCategory,
    maxResults: number = 50,
  ): Promise<GlobalMemory[]> {
    return this.repo.find({
      where: { category },
      order: { confidence: 'DESC', hitCount: 'DESC' },
      take: maxResults,
    });
  }

  /**
   * Get a specific entry by category + key.
   */
  async getByKey(category: GlobalMemoryCategory, key: string): Promise<GlobalMemory | null> {
    return this.repo.findOne({ where: { category, key } });
  }

  /**
   * Save a new entry or update existing (upsert by category+key).
   */
  async save(input: {
    category: GlobalMemoryCategory;
    key: string;
    value: Record<string, any>;
    confidence?: number;
  }): Promise<GlobalMemory> {
    if (!input.category || !input.key) {
      throw new BadRequestException('category and key are required');
    }

    const validCategories: GlobalMemoryCategory[] = [
      'false_positive',
      'successful_payload',
      'tech_profile',
      'pattern_rule',
    ];
    if (!validCategories.includes(input.category)) {
      throw new BadRequestException(
        `Invalid category: ${input.category}. Must be one of: ${validCategories.join(', ')}`,
      );
    }

    let existing = await this.repo.findOne({
      where: { category: input.category, key: input.key },
    });

    if (existing) {
      // Merge value and update confidence (weighted average)
      const oldWeight = existing.hitCount;
      const newConfidence = input.confidence ?? existing.confidence;
      existing.value = { ...existing.value, ...input.value };
      existing.confidence =
        oldWeight > 0
          ? Math.round((existing.confidence * oldWeight + newConfidence) / (oldWeight + 1))
          : newConfidence;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      category: input.category,
      key: input.key,
      value: input.value,
      confidence: input.confidence ?? 50,
      hitCount: 0,
    });
    return this.repo.save(entity);
  }

  /**
   * Update an existing entry: increment hit_count, optionally update confidence.
   */
  async update(
    category: GlobalMemoryCategory,
    key: string,
    updates?: { confidence?: number; value?: Record<string, any> },
  ): Promise<GlobalMemory | null> {
    const existing = await this.repo.findOne({ where: { category, key } });
    if (!existing) return null;

    existing.hitCount += 1;
    existing.lastUsedAt = new Date();

    if (updates?.confidence != null) {
      existing.confidence = updates.confidence;
    }
    if (updates?.value) {
      existing.value = { ...existing.value, ...updates.value };
    }

    return this.repo.save(existing);
  }

  /**
   * Auto-save a successful payload from a high-confidence finding.
   * Called by report_finding when confidence >= 80.
   */
  async autoSavePayload(params: {
    vulnType: string;
    techStack?: string;
    payload: string;
    context: Record<string, any>;
    confidence: number;
  }): Promise<void> {
    const techTag = params.techStack ? params.techStack.toLowerCase().replace(/\s+/g, '_') : 'generic';
    const key = `payload:${params.vulnType.toLowerCase()}:${techTag}`;

    await this.save({
      category: 'successful_payload',
      key,
      value: {
        payload: params.payload,
        vulnType: params.vulnType,
        techStack: params.techStack ?? 'unknown',
        ...params.context,
        successCount: 1,
      },
      confidence: params.confidence,
    });
  }

  /**
   * Auto-save a false positive pattern.
   */
  async autoSaveFalsePositive(params: {
    category: string;
    patternHash: string;
    signature: string;
    exampleResponse?: string;
    reason: string;
  }): Promise<void> {
    const key = `fp:${params.category}:${params.patternHash}`;

    await this.save({
      category: 'false_positive',
      key,
      value: {
        signature: params.signature,
        exampleResponse: params.exampleResponse ?? '',
        reason: params.reason,
      },
      confidence: 70,
    });
  }

  /**
   * Auto-save or update a technology profile.
   */
  async autoSaveTechProfile(params: {
    techName: string;
    commonVulns?: string[];
    priorityChecklist?: Record<string, boolean>;
    wordlistRecommendations?: string[];
  }): Promise<void> {
    const key = `profile:${params.techName.toLowerCase().replace(/\s+/g, '_')}`;

    await this.save({
      category: 'tech_profile',
      key,
      value: {
        techName: params.techName,
        commonVulns: params.commonVulns ?? [],
        priorityChecklist: params.priorityChecklist ?? {},
        wordlistRecommendations: params.wordlistRecommendations ?? [],
      },
      confidence: 60,
    });
  }

  /**
   * Get successful payloads for a specific vuln type + tech stack.
   * Prioritizes: exact tech match first, then generic.
   */
  async getPayloadsForTarget(
    vulnType: string,
    techStack?: string,
  ): Promise<GlobalMemory[]> {
    const techTag = techStack
      ? techStack.toLowerCase().replace(/\s+/g, '_')
      : 'generic';

    // Try exact tech match first
    const exact = await this.repo.find({
      where: { category: 'successful_payload', key: `payload:${vulnType.toLowerCase()}:${techTag}` },
      order: { confidence: 'DESC', hitCount: 'DESC' },
      take: 10,
    });

    if (exact.length > 0) return exact;

    // Fallback: same vuln type, any tech
    return this.repo
      .createQueryBuilder('gm')
      .where('gm.category = :cat', { cat: 'successful_payload' })
      .andWhere('gm.key LIKE :pattern', {
        pattern: `payload:${vulnType.toLowerCase()}:%`,
      })
      .orderBy('gm.confidence', 'DESC')
      .addOrderBy('gm.hitCount', 'DESC')
      .limit(10)
      .getMany();
  }

  /**
   * Get tech profile for a specific technology.
   */
  async getTechProfile(techName: string): Promise<GlobalMemory | null> {
    const key = `profile:${techName.toLowerCase().replace(/\s+/g, '_')}`;
    return this.repo.findOne({ where: { category: 'tech_profile', key } });
  }

  /**
   * Check if a pattern is a known false positive.
   */
  async isFalsePositive(signature: string): Promise<GlobalMemory | null> {
    const results = await this.repo
      .createQueryBuilder('gm')
      .where('gm.category = :cat', { cat: 'false_positive' })
      .andWhere(
        'LOWER(gm.value::text) LIKE :needle',
        { needle: `%${signature.toLowerCase().substring(0, 100)}%` },
      )
      .orderBy('gm.confidence', 'DESC')
      .limit(1)
      .getMany();

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Simple relevance score based on key match.
   */
  private computeRelevance(query: string, key: string, value: Record<string, any>): number {
    const q = query.toLowerCase();
    const k = key.toLowerCase();
    let score = 0;
    if (k.includes(q)) score += 50;
    if (k.startsWith(q)) score += 30;
    const valueStr = JSON.stringify(value).toLowerCase();
    if (valueStr.includes(q)) score += 20;
    return Math.min(100, score);
  }
}
