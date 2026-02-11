import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { MessagePart } from './message-part.entity';
import { MessageFile } from './message-file.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

@Entity('messages')
@Index(['conversation', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageRole,
  })
  role: MessageRole;

  @Column({ type: 'text', nullable: true })
  content: string; // Plain text content (legacy/compatibility)

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @OneToMany(() => MessagePart, (part) => part.message, { cascade: true })
  parts: MessagePart[];

  @OneToMany(() => MessageFile, (file) => file.message, { cascade: true })
  files: MessageFile[];
}
