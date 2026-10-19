import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO4217CurrencyCode } from '../../../common/validators/is-iso4217-currency-code.validator';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpsertMerchantLimitsDto {
    @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
    @IsISO4217CurrencyCode({ supportedOnly: true })
    currency: string;

    @ApiPropertyOptional({ example: 1000, nullable: true })
    @IsOptional()
    @IsNumber()
    @Min(0.01)
    maxSinglePayment?: number | null;

    @ApiPropertyOptional({ example: 10000, nullable: true })
    @IsOptional()
    @IsNumber()
    @Min(0.01)
    dailyVolume?: number | null;

    @ApiPropertyOptional({ example: 100000, nullable: true })
    @IsOptional()
    @IsNumber()
    @Min(0.01)
    monthlyVolume?: number | null;
}