import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * One row per AI tool action: conversation_id, domain, ai_action, result, reasoning.
 * Users can view all activity in the Hacktivity table and open detail for each action.
 */
@Entity('hacktivity')
@Index(['userId', 'createdAt'])
@Index(['conversationId', 'createdAt'])
export class Hacktivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  conversationId: string | null;

  /** Target domain/URL (e.g. from conversation context or tool args). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  domain: string | null;

  /** Tool result output (clipped for storage). */
  @Column({ type: 'text', nullable: true })
  result: string | null;

  /** Tool arguments (for detail view). */
  @Column({ type: 'jsonb', nullable: true })
  toolArgs: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
