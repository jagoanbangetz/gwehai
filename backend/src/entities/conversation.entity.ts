import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';

@Entity('conversations')
@Index(['user', 'createdAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, (user) => user.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  title: string; // Auto-generated from first message

  @Column({ type: 'uuid', nullable: true })
  modelId: string; // Selected model for this conversation

  @Column({ type: 'uuid', nullable: true })
  @Index()
  parentConversationId: string | null; // For sub-agent sessions (sessions_spawn)

  @Column({ type: 'varchar', length: 64, nullable: true })
  agentRole: string | null; // e.g. "recon", "exploit", "general" — used for sessions_spawn

  @Column({ type: 'varchar', length: 32, default: 'finished' })
  runStatus: string; // running | finished | error | stopped

  /** When set, this conversation is linked to a pentest job (one job = one chat context). */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  pentestJobId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => Message, (message) => message.conversation, {
    cascade: true,
  })
  messages: Message[];
}
