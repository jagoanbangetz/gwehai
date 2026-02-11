import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserPlan } from './user-plan.entity';
import { PlanUsageDaily } from './plan-usage-daily.entity';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyPriceUsd: number | null;

  @Column({ type: 'int', nullable: true })
  pointsIncluded: number | null;

  @Column({ type: 'int', nullable: true })
  reportsIncluded: number | null;

  @Column({ default: false })
  isRecurring: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserPlan, (userPlan) => userPlan.plan)
  userPlans: UserPlan[];

  @OneToMany(() => PlanUsageDaily, (usage) => usage.plan)
  dailyUsage: PlanUsageDaily[];
}

