import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminSetting } from '../entities/admin-setting.entity';

/**
 * AdminSettingsService — reads API keys from admin_settings DB table first,
 * falls back to process.env. Caches for 60 seconds to avoid hammering the DB.
 */
@Injectable()
export class AdminSettingsService {
  private cache = new Map<string, { value: string | null; ts: number }>();
  private readonly TTL_MS = 60_000; // 60 seconds

  constructor(
    @InjectRepository(AdminSetting)
    private readonly settingsRepo: Repository<AdminSetting>,
  ) {}

  /**
   * Get an API key by env var name (e.g. 'DEEPSEEK_API_KEY').
   * Priority: DB admin_settings → process.env fallback.
   * Returns undefined if neither has a value.
   */
  async getApiKey(envKey: string): Promise<string | undefined> {
    const cached = this.cache.get(envKey);
    if (cached && Date.now() - cached.ts < this.TTL_MS) {
      return cached.value ?? process.env[envKey] ?? undefined;
    }

    // Query DB
    let dbValue: string | null = null;
    try {
      const row = await this.settingsRepo.findOne({ where: { key: envKey } });
      dbValue = row?.value ?? null;
    } catch {
      // DB error — fall through to env
    }

    this.cache.set(envKey, { value: dbValue, ts: Date.now() });

    if (dbValue && dbValue.trim()) {
      return dbValue.trim();
    }

    return process.env[envKey]?.trim() || undefined;
  }

  /**
   * Get any admin setting by key (not just API keys).
   * Same DB-first, env-fallback, 60s cache logic.
   */
  async getSetting(key: string): Promise<string | undefined> {
    return this.getApiKey(key);
  }

  /**
   * Invalidate cache for a specific key (call after admin saves a setting).
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cached settings.
   */
  invalidateAll(): void {
    this.cache.clear();
  }
}
