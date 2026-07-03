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

export type WebhookEvent =
  | 'pentest.completed'
  | 'pentest.failed'
  | 'finding.critical'
  | 'finding.high';

@Entity('webhooks')
@Index(['userId'])
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Human-friendly label for this webhook (e.g. "Slack notification"). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  label: string | null;

  /** The URL to POST to when an event fires. Must be HTTPS in production. */
  @Column({ type: 'text' })
  url: string;

  /** HMAC-SHA256 secret for signing payloads. Auto-generated on create. */
  @Column({ type: 'varchar', length: 128 })
  secret: string;

  /** Events this webhook subscribes to. Stored as JSON array. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  events: WebhookEvent[];

  /** Whether this webhook is active. Can be toggled without deleting. */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Number of consecutive delivery failures. Reset on success. */
  @Column({ type: 'int', default: 0 })
  failureCount: number;

  /** Last time a delivery was attempted (success or failure). */
  @Column({ type: 'timestamp', nullable: true })
  lastDeliveryAt: Date | null;

  /** Last HTTP status code received from the target URL. */
  @Column({ type: 'int', nullable: true })
  lastStatusCode: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
