import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type VerificationPurpose = 'login' | 'signup' | 'signup_link' | 'password_reset';

@Entity('verification_codes')
@Index(['email', 'purpose'])
@Index(['expiresAt'])
export class VerificationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ length: 256 })
  code: string;

  @Column({ type: 'varchar', length: 32 })
  purpose: VerificationPurpose;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
