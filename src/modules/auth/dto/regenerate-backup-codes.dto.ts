import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class RegenerateBackupCodesDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Account password for confirmation.',
    example: 'P@ssw0rd!',
  })
  password?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Two-factor code must be 6 digits' })
  @ApiPropertyOptional({
    description: 'Six-digit authenticator app code.',
    example: '123456',
  })
  twoFactorCode?: string;
}
