import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('settlement_adjustments')
export class SettlementAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  settlementId: string;

  @Column('uuid')
  refundId: string;

  @Column('uuid')
  paymentId: string;

  @Index()
  @Column()
  merchantId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;
}
