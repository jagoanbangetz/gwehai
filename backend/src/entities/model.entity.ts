import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UsageEvent } from './usage-event.entity';

export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  DEEPSEEK = 'deepseek',
  CUSTOM = 'custom',
}

@Entity('models')
export class Model {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // e.g., "gpt-4", "claude-3-opus"

  @Column()
  displayName: string; // e.g., "GPT-4", "Claude Opus 3"

  @Column({
    type: 'enum',
    enum: ModelProvider,
  })
  provider: ModelProvider;

  @Column({ nullable: true })
  apiModelId: string; // Actual model ID sent to the provider API (e.g., "gpt-4-turbo")

  @Column({ type: 'text', nullable: true })
  @Exclude()
  apiKey: string; // API key for this provider — NEVER exposed in API responses

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pointsPer1kInputTokens: number; // Cost in points per 1k input tokens

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pointsPer1kOutputTokens: number; // Cost in points per 1k output tokens

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional model config

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => UsageEvent, (usage) => usage.model)
  usageEvents: UsageEvent[];
}
