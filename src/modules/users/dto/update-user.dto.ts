import {
  IsOptional,
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../../notifications/i18n/locale';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User display name',
    example: 'Jane Doe',
    minLength: 1,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Preferred language for transactional emails.',
    enum: SUPPORTED_LOCALES,
    example: 'fr',
  })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({
    description: 'User email address. Changing email triggers re-verification.',
    example: 'jane.new@example.com',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description:
      'New password (minimum 10 characters, must include uppercase, lowercase, number, and special character). Requires currentPassword.',
    example: 'N3wP@ssw0rd!',
    minLength: 10,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password?: string;

  @ApiPropertyOptional({
    description: 'Current password required when changing password.',
    example: 'Curr3nt@Pss!',
  })
  @ValidateIf(
    (o) => o.password !== undefined && o.password !== null && o.password !== '',
  )
  @IsNotEmpty({
    message: 'currentPassword is required when password is provided',
  })
  @IsString()
  currentPassword?: string;
}
