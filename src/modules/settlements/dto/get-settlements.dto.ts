import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class GetSettlementsDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Start date filter (ISO 8601 format) — filters by processedAt >= from',
    example: '2026-01-01T00:00:00Z',
  })
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description:
      'End date filter (ISO 8601 format) — filters by processedAt <= to',
    example: '2026-12-31T23:59:59Z',
  })
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date' })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Filter by merchant ID (admin-only) — filters by merchantId = merchantId',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'merchantId must be a valid UUID' })
  @IsOptional()
  merchantId?: string;
}
