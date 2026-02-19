import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AdminSetting } from '../entities/admin-setting.entity';

const POLICY_LIMIT_KEYS = [
  'maxParallelJobsPerPlan',
  'maxSubAgentsPerPlan',
  'maxToolCallsPerJob',
  'maxStepsPerConversation',
] as const;

export interface PolicyOverrides {
  maxParallelJobsPerPlan: number;
  maxSubAgentsPerPlan: number;
  maxToolCallsPerJob: number;
  maxStepsPerConversation: number;
}

const DEFAULT_OVERRIDES: PolicyOverrides = {
  maxParallelJobsPerPlan: 2,
  maxSubAgentsPerPlan: 1,
  maxToolCallsPerJob: 500,
  maxStepsPerConversation: 100,
};

function num(v: string | null | undefined, def: number): number {
  if (v == null || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/**
 * Reads admin policy overrides from admin_settings (Guardrails "Global limits").
 * Used by gwehai and pentest-jobs to cap plan limits so the UI settings actually apply.
 */
@Injectable()
export class PolicyOverridesService {
  constructor(
    @InjectRepository(AdminSetting)
    private readonly settingsRepo: Repository<AdminSetting>,
  ) {}

  async getOverrides(): Promise<PolicyOverrides> {
    const rows = await this.settingsRepo.find({
      where: { key: In([...POLICY_LIMIT_KEYS]) },
    });
    const map = new Map(rows.map((r) => [r.key, r.value ?? null]));
    return {
      maxParallelJobsPerPlan: num(map.get('maxParallelJobsPerPlan'), DEFAULT_OVERRIDES.maxParallelJobsPerPlan),
      maxSubAgentsPerPlan: num(map.get('maxSubAgentsPerPlan'), DEFAULT_OVERRIDES.maxSubAgentsPerPlan),
      maxToolCallsPerJob: num(map.get('maxToolCallsPerJob'), DEFAULT_OVERRIDES.maxToolCallsPerJob),
      maxStepsPerConversation: num(map.get('maxStepsPerConversation'), DEFAULT_OVERRIDES.maxStepsPerConversation),
    };
  }
}
