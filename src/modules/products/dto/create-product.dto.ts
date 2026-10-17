import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsISO4217CurrencyCode } from '../../../common/validators/is-iso4217-currency-code.validator';

export class CreateProductDto {
  @ApiProperty({ description: 'Product name', example: 'Enterprise Plan' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    description: 'Product description',
    example: 'Monthly subscription for enterprise features',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Unit amount (price in decimal units)', example: 99.00 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitAmount: number;

  @ApiProperty({ description: 'Currency code (ISO 4217)', example: 'USD' })
  @IsString()
  @IsISO4217CurrencyCode({ supportedOnly: true })
  currency: string;

  @ApiPropertyOptional({
    description: 'Whether the product is active',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
