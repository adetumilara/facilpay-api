import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum EmailSuppressionReason {
  HARD_BOUNCE = 'hard_bounce',
  COMPLAINT = 'complaint',
  MANUAL = 'manual',
}

@Entity('email_suppressions')
export class EmailSuppression {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored lower-cased so lookups are case-insensitive. */
  @Index('UQ_email_suppressions_email', { unique: true })
  @Column({ length: 255 })
  email: string;

  @Column({ type: 'enum', enum: EmailSuppressionReason })
  reason: EmailSuppressionReason;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null = null;

  @Column({ type: 'text', nullable: true })
  details: string | null = null;

  @CreateDateColumn()
  createdAt: Date;
}
