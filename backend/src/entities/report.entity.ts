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

export enum ReportStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('reports')
@Index(['userId', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  conversationId: string | null;

  @Column({ type: 'text', nullable: true })
  detail: string | null; // Bug/finding description (e.g. from pentest agent)

  @Column({ type: 'text', nullable: true })
  poc: string | null; // Proof-of-concept (steps, payload, curl, etc.)

  @Column({ unique: true, nullable: true })
  jobId: string | null; // External API job identifier (null for agent-saved findings)

  @Column({ nullable: true })
  target: string;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.QUEUED,
  })
  status: ReportStatus;

  @Column({ nullable: true })
  fileUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

