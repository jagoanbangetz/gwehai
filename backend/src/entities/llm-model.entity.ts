import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LlmModelProvider {
  DEEPSEEK = 'deepseek',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

@Entity('llm_models')
export class LlmModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  key: string;

  @Column({
    type: 'varchar',
    length: 32,
  })
  provider: LlmModelProvider | string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'boolean', default: false })
  supportsPromptCache: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 0 })
  priceInPer1M: number;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 0 })
  priceOutPer1M: number;

  @Column({ type: 'decimal', precision: 12, scale: 6, nullable: true })
  priceCachedInPer1M: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  toolCallFeeUsd: number | null;

  @Column({ type: 'int', nullable: true })
  minCostCredits: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
