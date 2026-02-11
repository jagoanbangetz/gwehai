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
import { CreditPack } from './credit-pack.entity';

export enum CreditOrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  MANUAL = 'manual',
}

@Entity('credit_orders')
@Index(['user', 'createdAt'])
@Index(['idempotencyKey'], { unique: true })
export class CreditOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.creditOrders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  creditPackId: string;

  @ManyToOne(() => CreditPack, (pack) => pack.orders)
  @JoinColumn({ name: 'creditPackId' })
  creditPack: CreditPack;

  @Column({
    type: 'enum',
    enum: CreditOrderStatus,
    default: CreditOrderStatus.PENDING,
  })
  status: CreditOrderStatus;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
  })
  provider: PaymentProvider;

  @Column({ nullable: true })
  providerPaymentIntentId: string; // Stripe payment_intent ID, etc.

  @Column({ nullable: true })
  providerChargeId: string; // Stripe charge ID, etc.

  @Column({ unique: true })
  idempotencyKey: string; // Prevent duplicate processing

  @Column({ type: 'int' })
  amountCents: number; // Amount charged

  @Column({ type: 'int' })
  pointsGranted: number; // Points that will be/were granted

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional order metadata

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
