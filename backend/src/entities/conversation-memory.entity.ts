import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/**
 * Conversation memory is stored only in the database as one JSON object per conversation.
 * No path column — keys (main, daily/YYYY-MM-DD, daily/website/YYYY-MM-DD) are inside the "data" JSON.
 */
@Entity('conversation_memory')
export class ConversationMemory {
  @PrimaryColumn('uuid')
  conversationId: string;

  @OneToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  /** Memory content as JSON: { "main": "text", "daily/example.com/2026-02-10": "text" } */
  @Column({ type: 'jsonb', default: {} })
  data: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
