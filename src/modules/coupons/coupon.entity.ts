import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CouponType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

@Entity('coupons')
@Index('UQ_coupons_merchant_code', ['merchantId', 'code'], { unique: true })
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  merchantId: string;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 8 })
  type: CouponType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({ type: 'integer', nullable: true })
  maxRedemptions: number | null;

  @Column({ type: 'integer', default: 0 })
  redemptions: number;

  @Column({ type: 'integer', default: 0 })
  reservedRedemptions: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  applicableLinkIds: string[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}