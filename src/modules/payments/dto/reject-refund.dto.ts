import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectRefundDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiPropertyOptional({
    description: 'Reason for rejection',
    example: 'Amount exceeds merchant policy limit',
    maxLength: 500,
  })
  reason?: string;
}
