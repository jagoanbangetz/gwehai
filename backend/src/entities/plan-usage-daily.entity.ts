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

@Entity('plan_usage_daily')
@Index(['userId', 'date'])
@Index(['planId', 'date'])
export class PlanUsageDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => Plan, (plan) => plan.dailyUsage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  pointsUsed: number;

  @Column({ type: 'int', default: 0 })
  messagesSent: number;

  @Column({ type: 'int', default: 0 })
  reportsGenerated: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

