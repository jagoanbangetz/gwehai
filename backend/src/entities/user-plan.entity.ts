import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Plan } from './plan.entity';

export enum UserPlanStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  TRIAL = 'trial',
}

@Entity('user_plans')
@Index(['userId', 'status'])
export class UserPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => Plan, (plan) => plan.userPlans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({
    type: 'enum',
    enum: UserPlanStatus,
    default: UserPlanStatus.ACTIVE,
  })
  status: UserPlanStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'int', default: 0 })
  pointsGranted: number;

  @Column({ type: 'int', default: 0 })
  pointsUsed: number;

  @Column({ type: 'int', default: 0 })
  reportsGenerated: number;

  @Column({ type: 'int', default: 0 })
  messagesSent: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

