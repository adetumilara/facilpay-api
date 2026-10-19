import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Dispute } from './dispute.entity';

@Entity('dispute_evidence')
@Index('idx_dispute_evidence_dispute_id', ['disputeId'])
export class DisputeEvidence {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  disputeId: string;

  @ManyToOne(() => Dispute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'disputeId' })
  dispute: Dispute;

  @Column({ nullable: true })
  @ApiPropertyOptional({ description: 'User ID of the uploader' })
  uploadedBy: string | null;

  @Column()
  @ApiProperty()
  fileName: string;

  @Column()
  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @Column({ type: 'int' })
  @ApiProperty()
  sizeBytes: number;

  @Column()
  @ApiProperty({ description: 'Internal storage key / path' })
  storageKey: string;

  @CreateDateColumn()
  @ApiProperty()
  createdAt: Date;
}
