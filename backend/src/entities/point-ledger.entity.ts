import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum PointLedgerType {
  GRANT = 'grant', // Points added
  SPEND = 'spend', // Points deducted
  REFUND = 'refund', // Points refunded
  SUBSCRIPTION_GRANT = 'subscription_grant', // Monthly subscription points
}

export enum PointLedgerReason {
  CREDIT_PURCHASE = 'credit_purchase',
  CHAT_USAGE = 'chat_usage',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  REFUND = 'refund',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  PROMOTION = 'promotion',
}

@Entity('point_ledger')
@Index(['user', 'createdAt'])
@Index(['refTable', 'refId'])
export class PointLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.pointLedgerEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  deltaPoints: number; // Positive for grants, negative for spends

  @Column({
    type: 'enum',
    enum: PointLedgerType,
  })
  type: PointLedgerType;

  @Column({
    type: 'enum',
    enum: PointLedgerReason,
  })
  reason: PointLedgerReason;

  @Column({ nullable: true })
  refTable: string; // e.g., 'credit_orders', 'usage_events', 'subscriptions'

  @Column({ type: 'uuid', nullable: true })
  refId: string; // ID of the referenced record

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional context

  @CreateDateColumn()
  createdAt: Date;
}
