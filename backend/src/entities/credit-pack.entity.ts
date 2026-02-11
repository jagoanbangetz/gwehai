import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CreditOrder } from './credit-order.entity';

@Entity('credit_packs')
export class CreditPack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  code: string; // Optional promo code

  @Column({ type: 'int' })
  priceCents: number; // Price in cents (e.g., 2000 = $20.00)

  @Column({ type: 'int' })
  points: number; // Points granted (e.g., 100)

  @Column({ default: 'USD' })
  currency: string;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional pack metadata

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => CreditOrder, (order) => order.creditPack)
  orders: CreditOrder[];
}
