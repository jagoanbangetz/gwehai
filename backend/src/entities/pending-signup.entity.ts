import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pending_signups')
export class PendingSignup {
  @PrimaryColumn()
  email: string;

  @Column()
  name: string;

  @Column()
  password_hash: string;

  @Column({ length: 8 })
  otp_code: string;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  createdAt: Date;
}
