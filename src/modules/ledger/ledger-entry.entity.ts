import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LedgerAccount {
  AVAILABLE = 'AVAILABLE',
  PENDING = 'PENDING',
  FEES = 'FEES',
  RESERVE = 'RESERVE',
  PAYOUT = 'PAYOUT',
}

export enum LedgerReferenceType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  SETTLEMENT = 'SETTLEMENT',
  FEE = 'FEE',
  ADJUSTMENT = 'ADJUSTMENT',
  PAYMENT_SPLIT = 'PAYMENT_SPLIT',
}

@Entity('ledger_entries')
@Index('IDX_ledger_entries_merchant_created', ['merchantId', 'createdAt'])
@Index('IDX_ledger_entries_transaction', ['transactionId'])
@Index('IDX_ledger_entries_merchant_account', [
  'merchantId',
  'currency',
  'account',
])
@Index('IDX_ledger_entries_reference', [
  'merchantId',
  'referenceType',
  'referenceId',
])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  merchantId: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 20 })
  account: LedgerAccount;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 50 })
  referenceType: LedgerReferenceType;

  @Column({ type: 'varchar', length: 255 })
  referenceId: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
