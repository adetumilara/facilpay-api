import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ActorType = 'user' | 'api_key' | 'system';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  actorId: string | null;

  @Column({ length: 50 })
  actorType: ActorType;

  @Column({ length: 100 })
  action: string;

  @Column({ length: 100 })
  resourceType: string;

  @Column({ nullable: true })
  resourceId: string | null;

  @Column({ length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ length: 512, nullable: true })
  userAgent: string | null;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
