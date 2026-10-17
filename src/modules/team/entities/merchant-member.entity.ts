import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum TeamRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
  SUPPORT = 'SUPPORT',
  VIEWER = 'VIEWER',
}

@Entity('merchant_members')
@Unique('UQ_merchant_members_merchantId_userId', ['merchantId', 'userId'])
@Index('IDX_merchant_members_merchantId', ['merchantId'])
@Index('IDX_merchant_members_userId', ['userId'])
export class MerchantMember {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column('uuid')
  @ApiProperty({ description: "Owner's user ID" })
  merchantId: string;

  @Column('uuid')
  @ApiProperty({ description: "Team member's user ID" })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  @ApiProperty({ enum: TeamRole })
  role: TeamRole;

  @Column('uuid')
  @ApiProperty({ description: 'User ID who sent the invitation' })
  invitedBy: string;

  @Column({ type: 'timestamptz' })
  @ApiProperty()
  joinedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
