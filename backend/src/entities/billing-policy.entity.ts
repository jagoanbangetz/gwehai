import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('billing_policies')
export class BillingPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** USD per credit (e.g. 0.01 = 1 cent per credit). */
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  creditUsd: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 1.1 })
  defaultRetryFactor: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.002 })
  defaultPlatformFeeUsd: number;

  /** Min credits per operation type, e.g. { "chat_turn": 1, "agent_step": 2, "scan_start": 10, "report": 20 }. */
  @Column({ type: 'jsonb' })
  minCreditsPerOp: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
