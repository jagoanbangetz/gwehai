import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Per-user, per-day quota usage for plan enforcement (sessions started, tokens used). */
@Entity('plan_quota_usage_daily')
@Index(['userId', 'date'], { unique: true })
export class PlanQuotaUsageDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  sessionsStarted: number;

  @Column({ type: 'int', default: 0 })
  tokensUsed: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
