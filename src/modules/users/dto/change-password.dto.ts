import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The current (existing) password for the account.',
    example: 'Curr3nt@Pss!',
  })
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @ApiProperty({
    description:
      'The new password. Must satisfy the strength policy (min 10 chars, upper/lower/digit/special). Cannot be a recently used password.',
    example: 'N3wP@ssw0rd!2026',
  })
  newPassword: string;
}
