import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type GlobalMemoryCategory =
  | 'false_positive'
  | 'successful_payload'
  | 'tech_profile'
  | 'pattern_rule';

@Entity('global_memory')
@Index(['category', 'key'], { unique: true })
@Index(['category'])
@Index(['key'])
export class GlobalMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Category type: false_positive, successful_payload, tech_profile, pattern_rule */
  @Column({ type: 'varchar', length: 32 })
  category: GlobalMemoryCategory;

  /** Unique key — e.g. fp:sql:error_header, payload:xss:laravel, profile:wordpress */
  @Column({ type: 'varchar', length: 255 })
  key: string;

  /** Pattern data as JSON */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  value: Record<string, any>;

  /** Confidence score 0-100 */
  @Column({ type: 'float', default: 50 })
  confidence: number;

  /** How many times this pattern has been used */
  @Column({ type: 'int', default: 0 })
  hitCount: number;

  /** Last time this pattern was referenced */
  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
