import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsISO4217CurrencyCode } from '../../../common/validators/is-iso4217-currency-code.validator';

export class InvoiceLineItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({
    description:
      'Line item description. If productId is provided, this is optional and defaults to the product name.',
    example: 'Consulting services',
  })
  description?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Reference to a catalog product. When provided, unitPrice (if omitted) defaults to the product unitAmount at use time.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  productId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @ApiProperty({ example: 2 })
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Unit price in decimal currency units. Required if productId is not provided.',
    example: 125,
  })
  unitPrice?: number;
}

export class CreateInvoiceDto {
  @IsEmail()
  @ApiProperty({ example: 'billing@example.com' })
  customerEmail: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  @ApiPropertyOptional({ example: 'Acme Ltd' })
  customerName?: string;

  @IsString()
  @IsISO4217CurrencyCode({ supportedOnly: true })
  @ApiProperty({ example: 'USD' })
  currency: string;

  @IsISO8601()
  @ApiProperty({ example: '2026-12-31T00:00:00.000Z' })
  dueDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 8.25, minimum: 0, maximum: 100 })
  taxRate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  @ApiProperty({ type: [InvoiceLineItemDto] })
  lineItems: InvoiceLineItemDto[];
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export class PayInvoiceDto {
  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional({ example: 'payer@example.com' })
  payerEmail?: string;
}
