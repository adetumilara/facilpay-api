import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The new email address. A confirmation link will be sent to this address.',
    example: 'jane.new@example.com',
  })
  newEmail: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Current account password, required to authorise the change.',
    example: 'Curr3nt@Pss!',
  })
  password: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'TOTP code if two-factor authentication is enabled.',
    example: '123456',
  })
  twoFactorCode?: string;
}
