import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('webauthn_challenges')
@Index('IDX_webauthn_challenges_userId_expiresAt', ['userId', 'expiresAt'])
export class WebAuthnChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  purpose: 'registration' | 'authentication';

  @Column({ type: 'varchar', length: 255 })
  challenge: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
