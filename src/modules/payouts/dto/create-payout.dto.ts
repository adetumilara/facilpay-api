import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePayoutDto {
  @ApiProperty({
    description: 'Destination Stellar account (G... public key)',
    example: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'destination must be a Stellar public key' })
  destination: string;

  @ApiProperty({
    description: 'Amount as a decimal string with up to 7 decimal places',
    example: '125.50',
  })
  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d{1,13}(\.\d{1,7})?$/, {
    message: 'amount must be a positive decimal with at most 7 decimal places',
  })
  amount: string;

  @ApiProperty({ description: 'Asset code to send', example: 'USDC' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9]{1,12}$/, { message: 'currency must be a Stellar asset code' })
  currency: string;

  @ApiPropertyOptional({
    description: 'Text memo (max 28 bytes). Required when the destination sets config.memo_required.',
    example: 'INV-2026-0042',
  })
  @IsOptional()
  @IsString()
  @MaxLength(28)
  memo?: string;

  @ApiProperty({
    description: 'Merchant reference, unique per merchant. Reusing a reference returns 409.',
    example: 'supplier-invoice-0042',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference: string;
}
