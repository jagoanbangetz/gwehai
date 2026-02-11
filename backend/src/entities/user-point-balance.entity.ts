import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Cached point balance for users.
 * Updated transactionally with point_ledger entries.
 * Uses optimistic locking (version column) to prevent race conditions.
 */
@Entity('user_point_balances')
@Index(['user'], { unique: true })
export class UserPointBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @ManyToOne(() => User, (user) => user.pointBalances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  balance: number; // Current point balance

  @VersionColumn()
  version: number; // For optimistic locking

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
