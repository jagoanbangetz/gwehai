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

  /** IP that started signup (for abuse limit and to set User.signupIp on verify). */
  @Column({ nullable: true })
  signup_ip: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
