import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('merchant_limits')
@Index('UQ_merchant_limits_merchant_currency', ['merchantId', 'currency'], {
    unique: true,
})
export class MerchantLimit {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    merchantId: string;

    @Column({ type: 'varchar', length: 3 })
    currency: string;

    @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
    maxSinglePayment: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
    dailyVolume: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
    monthlyVolume: number | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}