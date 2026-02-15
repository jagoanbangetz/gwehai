import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Per-conversation session quota usage (steps, tokens, last step time). */
@Entity('plan_quota_usage_session')
@Index(['userId', 'conversationId'], { unique: true })
export class PlanQuotaUsageSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'int', default: 0 })
  stepsUsed: number;

  @Column({ type: 'int', default: 0 })
  tokensUsed: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastStepAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
