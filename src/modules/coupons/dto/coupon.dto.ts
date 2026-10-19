import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsISO4217CurrencyCode } from '../../../common/validators/is-iso4217-currency-code.validator';
import { CouponType } from '../coupon.entity';

function IsValidCouponValue(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidCouponValue',
      target: (object as any).constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const type = (args.object as CreateCouponDto).type;
          return typeof value === 'number' && value > 0 &&
            (type !== CouponType.PERCENT || value <= 100);
        },
        defaultMessage() {
          return 'value must be positive, and percentage coupons cannot exceed 100';
        },
      },
    });
  };
}

export class CreateCouponDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,64}$/)
  @ApiProperty({ example: 'SPRING25' })
  code: string;

  @IsEnum(CouponType)
  @ApiProperty({ enum: CouponType })
  type: CouponType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsValidCouponValue()
  @ApiProperty({ example: 10 })
  value: number;

  @IsString()
  @ValidateIf((dto: CreateCouponDto) => dto.type === CouponType.FIXED)
  @IsISO4217CurrencyCode({ supportedOnly: true })
  @ApiPropertyOptional({ example: 'USD' })
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  @ApiPropertyOptional({ example: 100 })
  maxRedemptions?: number;

  @IsISO8601()
  @IsOptional()
  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  expiresAt?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ default: true })
  isActive?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  applicableLinkIds?: string[];
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}