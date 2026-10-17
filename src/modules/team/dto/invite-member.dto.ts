import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeamRole } from '../entities/merchant-member.entity';

export class InviteMemberDto {
  @IsEmail()
  @ApiProperty({ example: 'teammate@example.com' })
  email: string;

  @IsEnum(TeamRole)
  @ApiProperty({ enum: TeamRole, example: TeamRole.DEVELOPER })
  role: TeamRole;
}
