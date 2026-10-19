import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn()
  key: string;

  @Column('text')
  requestHash: string;

  @Column('jsonb')
  response: any;

  @Column()
  @Index()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
