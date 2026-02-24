import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { CreditOrder } from './credit-order.entity';
import { PointLedger } from './point-ledger.entity';
import { Subscription } from './subscription.entity';
import { UserPointBalance } from './user-point-balance.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  @Index()
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  password_hash: string;

  @Column({ nullable: true, default: 'en' })
  defaultLanguage: string;

  @Column({ nullable: true })
  defaultModelId: string;

  @Column({ nullable: true })
  lastLoginIp: string;

  /** IP at signup (for abuse prevention: limit signups per IP). */
  @Column({ nullable: true })
  signupIp: string | null;

  /** When the user completed signup (for abuse prevention window). */
  @Column({ type: 'timestamp', nullable: true })
  signupAt: Date | null;

  /** Plan ID: FREE | PRO | PRO_PLUS | ULTRA. Resolved in one place (PlanService.getUserPlan). Default FREE if null. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  planId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => Conversation, (conversation) => conversation.user)
  conversations: Conversation[];

  @OneToMany(() => CreditOrder, (order) => order.user)
  creditOrders: CreditOrder[];

  @OneToMany(() => PointLedger, (ledger) => ledger.user)
  pointLedgerEntries: PointLedger[];

  @OneToMany(() => Subscription, (subscription) => subscription.user)
  subscriptions: Subscription[];

  @OneToMany(() => UserPointBalance, (balance) => balance.user)
  pointBalances: UserPointBalance[];
}
