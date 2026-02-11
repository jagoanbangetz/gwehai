import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Message } from './message.entity';

export enum MessagePartType {
  TEXT = 'text',
  CODE = 'code',
  IMAGE = 'image',
}

@Entity('message_parts')
@Index(['message', 'order'])
export class MessagePart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  messageId: string;

  @ManyToOne(() => Message, (message) => message.parts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column({
    type: 'enum',
    enum: MessagePartType,
    default: MessagePartType.TEXT,
  })
  type: MessagePartType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', default: 0 })
  order: number; // For ordering parts within a message

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // e.g., language for code blocks
}
