import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InAppNotificationType {
  PAYMENT_RECEIVED = 'payment_received',
  REFUND_ISSUED = 'refund_issued',
  DISPUTE_OPENED = 'dispute_opened',
  DISPUTE_STATUS_CHANGED = 'dispute_status_changed',
  SETTLEMENT_PAID = 'settlement_paid',
  SECURITY_ALERT = 'security_alert',
}

@Entity('in_app_notifications')
@Index('IDX_in_app_notifications_userId_createdAt', ['userId', 'createdAt'])
@Index('IDX_in_app_notifications_userId_readAt', ['userId', 'readAt'])
export class InAppNotification {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @Index()
  @Column('uuid')
  @ApiProperty({ example: 'abc123-user-uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  @ApiProperty({ example: 'payment_received' })
  type: string;

  @Column({ type: 'varchar', length: 255 })
  @ApiProperty({ example: 'Payment received' })
  title: string;

  @Column({ type: 'text' })
  @ApiProperty({ example: 'You received a payment of 100.00 USD' })
  body: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  @ApiPropertyOptional({ example: '/payments/abc123' })
  link: string | null = null;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiPropertyOptional({ example: null })
  readAt: Date | null = null;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ example: '2026-01-26T10:00:00.000Z' })
  createdAt: Date;
}
