import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';

export class StepUpDto {
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password cannot be empty' })
  @ApiProperty({
    description: 'Account password for step-up confirmation.',
    example: 'P@ssw0rd!',
  })
  password: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'TOTP code if two-factor authentication is enabled. Either password or totpCode is required.',
    example: '123456',
  })
  totpCode?: string;
}

export class StepUpConfirmationDto {
  @ApiProperty({
    description: 'Step-up confirmation token valid for 5 minutes.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  stepUpToken: string;

  @ApiProperty({
    description: 'Token expiration time in ISO 8601 format.',
    example: '2026-08-30T14:15:00.000Z',
  })
  expiresAt: string;

  @ApiProperty({
    description: 'Message confirming step-up authentication.',
    example: 'Step-up authentication confirmed. This token is valid for 5 minutes.',
  })
  message: string;
}
