import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPaymentMetadata } from './payment-metadata.validator';

export class UpdatePaymentDto {
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Updated payment description. Send null to clear it.',
    example: 'Payment for order #12345',
    maxLength: 500,
    nullable: true,
  })
  description?: string | null;

  @IsObject()
  @IsPaymentMetadata()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Replacement metadata object. Maximum 20 keys; every value must be a string of at most 500 characters. Send null to clear it.',
    example: { orderId: 'order_123', note: 'updated' },
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
  })
  metadata?: Record<string, string> | null;

  @IsString()
  @MaxLength(255, {
    message: 'External reference must not exceed 255 characters',
  })
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Merchant-defined reference. Send null to clear it.',
    example: 'order-12345',
    maxLength: 255,
    nullable: true,
  })
  externalReference?: string | null;

  // These properties are declared only so the global whitelist does not turn
  // an attempted immutable-field update into a generic 422 response. The
  // service rejects their presence explicitly with 400, and Swagger hides them.
  @ApiHideProperty()
  @IsOptional()
  amount?: unknown;

  @ApiHideProperty()
  @IsOptional()
  currency?: unknown;

  @ApiHideProperty()
  @IsOptional()
  status?: unknown;

  @ApiHideProperty()
  @IsOptional()
  merchant?: unknown;

  @ApiHideProperty()
  @IsOptional()
  merchantId?: unknown;

  @ApiHideProperty()
  @IsOptional()
  refundedAmount?: unknown;

  @ApiHideProperty()
  @IsOptional()
  feeAmount?: unknown;

  @ApiHideProperty()
  @IsOptional()
  netAmount?: unknown;

  @ApiHideProperty()
  @IsOptional()
  settlementId?: unknown;

  @ApiHideProperty()
  @IsOptional()
  customerId?: unknown;
}
