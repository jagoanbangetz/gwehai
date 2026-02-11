import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Model } from './model.entity';
import { Message } from './message.entity';

@Entity('usage_events')
@Index(['user', 'createdAt'])
@Index(['model', 'createdAt'])
export class UsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  modelId: string;

  @ManyToOne(() => Model, (model) => model.usageEvents)
  @JoinColumn({ name: 'modelId' })
  model: Model;

  @Column({ type: 'uuid', nullable: true })
  messageId: string; // Reference to the message that triggered this usage

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPoints: number; // Points deducted for this usage

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional usage metadata

  @CreateDateColumn()
  createdAt: Date;
}
