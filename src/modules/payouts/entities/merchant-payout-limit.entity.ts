import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Per-merchant override of the platform daily payout limit (PAYOUT_DAILY_LIMIT). */
@Entity('merchant_payout_limits')
@Index('UQ_merchant_payout_limits_merchant_currency', ['merchantId', 'currency'], { unique: true })
export class MerchantPayoutLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  merchantId: string;

  @Column({ length: 12 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  dailyLimit: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
