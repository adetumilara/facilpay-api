import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, IsTimeZone } from 'class-validator';

export enum AnalyticsInterval {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum AnalyticsGroupBy {
  STATUS = 'status',
  CURRENCY = 'currency',
  PAYMENT_LINK = 'paymentLink',
}

export class GetPaymentAnalyticsDto {
  @ApiPropertyOptional({
    description: 'Start of the range (inclusive, ISO 8601). Defaults to 30 days before `to`.',
    example: '2026-03-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the range (exclusive, ISO 8601). Defaults to now.',
    example: '2026-04-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AnalyticsInterval, default: AnalyticsInterval.DAY })
  @IsOptional()
  @IsEnum(AnalyticsInterval)
  interval?: AnalyticsInterval = AnalyticsInterval.DAY;

  @ApiPropertyOptional({ description: 'Only include payments in this currency', example: 'USDC' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: AnalyticsGroupBy, description: 'Split each bucket into one series per group' })
  @IsOptional()
  @IsEnum(AnalyticsGroupBy)
  groupBy?: AnalyticsGroupBy;

  @ApiPropertyOptional({
    description: 'IANA timezone for bucket boundaries. Defaults to the merchant timezone setting, then UTC.',
    example: 'America/Sao_Paulo',
  })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
