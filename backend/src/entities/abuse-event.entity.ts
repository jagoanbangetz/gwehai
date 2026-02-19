import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('abuse_events')
@Index(['userId', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
@Index(['createdAt'])
export class AbuseEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 64 })
  eventType: string; // e.g. rate_limit_violation, repeated_target, high_velocity, internal_ip_attempt

  @Column({ type: 'int', default: 0 })
  requestsPerMin: number;

  @Column({ type: 'int', default: 0 })
  domainsTargeted: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  riskScore: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
