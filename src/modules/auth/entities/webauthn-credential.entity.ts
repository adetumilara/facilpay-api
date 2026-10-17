import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('webauthn_credentials')
@Index('IDX_webauthn_credentials_userId', ['userId'])
@Index('UQ_webauthn_credentials_credentialId', ['credentialId'], {
  unique: true,
})
export class WebAuthnCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  credentialId: string;

  @Column({ type: 'bytea' })
  publicKey: Buffer;

  @Column({ type: 'integer', default: 0 })
  counter: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  transports: string[];

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;
}
