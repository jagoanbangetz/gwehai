import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Log of admin actions for security audit. All admin-sensitive actions should be logged here.
 */
@Entity('admin_audit_logs')
@Index(['adminUserId', 'createdAt'])
@Index(['action', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  adminUserId: string;

  @Column({ type: 'varchar', length: 128 })
  action: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  resource: string | null;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
