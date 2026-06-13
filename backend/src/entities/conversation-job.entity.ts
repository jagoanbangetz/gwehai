import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('conversation_jobs')
export class ConversationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'uuid', unique: true })
  jobId: string;

  @Column({ type: 'varchar', length: 32, default: 'running' })
  status: string; // running | finished | error | idle

  @CreateDateColumn()
  createdAt: Date;
}
