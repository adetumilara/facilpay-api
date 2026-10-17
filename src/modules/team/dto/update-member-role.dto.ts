import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeamRole } from '../entities/merchant-member.entity';

export class UpdateMemberRoleDto {
  @IsEnum(TeamRole)
  @ApiProperty({ enum: TeamRole, example: TeamRole.SUPPORT })
  role: TeamRole;
}
