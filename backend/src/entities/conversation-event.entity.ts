import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';

@Entity('conversation_events')
@Index(['jobId', 'seq'])
export class ConversationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobId: string;

  @Column({ type: 'integer', default: 0 })
  seq: number;

  @Column({ type: 'varchar', length: 64 })
  eventType: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, any>;

  @CreateDateColumn()
  ts: Date;
}
