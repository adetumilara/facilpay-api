import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches, ValidateIf } from 'class-validator';

export class SetPayoutLimitDto {
  @ApiProperty()
  @IsUUID()
  merchantId: string;

  @ApiProperty({ example: 'USDC' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  currency: string;

  @ApiProperty({
    description: 'Maximum total payouts per UTC day. null resets to the platform default (PAYOUT_DAILY_LIMIT).',
    example: '5000',
    nullable: true,
    type: String,
  })
  @ValidateIf((o) => o.dailyLimit !== null)
  @IsString()
  @Matches(/^\d{1,13}(\.\d{1,7})?$/, { message: 'dailyLimit must be a non-negative decimal' })
  dailyLimit: string | null;
}
