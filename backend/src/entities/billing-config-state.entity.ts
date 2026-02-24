import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/** Single row: id = fixed UUID, version incremented when any billing config changes. */
@Entity('billing_config_state')
export class BillingConfigState {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
