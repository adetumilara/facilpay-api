import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendMerchantDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ description: 'Reason recorded for the suspension', maxLength: 2000 })
  reason?: string;
}
