import {
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
  IsString,
  IsEmail,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsEnum,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CustomFieldValueDto {
  @IsString()
  @ApiProperty({ description: 'Field key', example: 'tshirt_size' })
  key: string;

  @IsString()
  @ApiProperty({ description: 'Field value', example: 'L' })
  value: string;
}

export class RedeemPaymentLinkDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]{2,64}$/)
  @IsOptional()
  @ApiPropertyOptional({ example: 'SPRING25' })
  couponCode?: string;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  @Min(0.01)
  @ApiPropertyOptional({ description: 'Payer-supplied amount (required for flexible-amount links)', example: 25.0 })
  payerAmount?: number;

  @ValidateIf((o) => o.name !== undefined)
  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Payer name (required if link requires it)', example: 'John Doe' })
  name?: string;

  @ValidateIf((o) => o.email !== undefined)
  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Payer email (required if link requires it)', example: 'john@example.com' })
  email?: string;

  @ValidateIf((o) => o.phone !== undefined)
  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Payer phone (required if link requires it)', example: '+1234567890' })
  phone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => CustomFieldValueDto)
  @ApiPropertyOptional({ description: 'Custom field values', type: [CustomFieldValueDto] })
  customFields?: CustomFieldValueDto[];
}
