import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type LoginFailureReason =
  | 'bad_password'
  | 'locked'
  | '2fa_failed'
  | 'user_not_found'
  | 'email_not_verified'
  | 'account_deleted';

@Entity('login_events')
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class LoginEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null when the user does not exist (failed login with unknown email) */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ default: false })
  success: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true })
  reason: LoginFailureReason | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  /** ISO 3166-1 alpha-2 country code resolved from IP, optional */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
