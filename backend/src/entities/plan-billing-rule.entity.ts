import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plan_billing_rules')
export class PlanBillingRule {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  planId: string; // FREE | PRO | PRO_PLUS | ULTRA

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 3.0 })
  planMarkup: number;

  @Column({ type: 'int', default: 100000 })
  maxCreditsPerRun: number;

  @Column({ type: 'int', default: 500000 })
  maxTokensPerRun: number;

  @Column({ type: 'int', default: 500 })
  maxStepsPerRun: number;

  /** Allowed model keys for this plan, e.g. ["deepseek-chat", "gpt-4o"]. */
  @Column({ type: 'jsonb' })
  allowedModels: string[];

  /** Op-type multipliers, e.g. { "chat_turn": 1.0, "agent_step": 1.8, "multi_agent": 2.5, "exploit_refine": 3.5 }. */
  @Column({ type: 'jsonb' })
  opMultipliers: Record<string, number>;

  /** Per-model multiplier overrides, e.g. { "gpt-4o": 1.35, "claude-sonnet": 1.6 }. */
  @Column({ type: 'jsonb', nullable: true })
  modelMultiplierOverrides: Record<string, number> | null;

  @Column({ type: 'jsonb', nullable: true })
  opRetryFactorOverrides: Record<string, number> | null;

  @Column({ type: 'jsonb', nullable: true })
  opPlatformFeeOverrides: Record<string, number> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
