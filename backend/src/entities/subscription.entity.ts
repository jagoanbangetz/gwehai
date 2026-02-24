import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum SubscriptionStatus {
  /** Waiting for user to approve subscription on PayPal */
  APPROVAL_PENDING = 'approval_pending',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  PAST_DUE = 'past_due',
  UNPAID = 'unpaid',
}

export enum SubscriptionPlan {
  PRO = 'pro',
  PRO_PLUS = 'pro_plus',
  PRO_MAX = 'pro_max',
  ULTRA = 'ultra',
}

@Entity('subscriptions')
@Index(['user', 'status'])
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Column({ type: 'int', default: 0 })
  monthlyPointsGrant: number; // Points granted each month

  /** Our plan ID (PRO, PRO_PLUS, ULTRA) for syncing to user.planId */
  @Column({ type: 'varchar', length: 32, nullable: true })
  planId: string | null;

  @Column({ nullable: true })
  providerSubscriptionId: string; // PayPal subscription ID (I-xxx)

  @Column({ nullable: true })
  providerCustomerId: string; // External provider customer ID

  @Column({ type: 'timestamp', nullable: true })
  currentPeriodStart: Date;

  @Column({ type: 'timestamp', nullable: true })
  currentPeriodEnd: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional subscription metadata

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
