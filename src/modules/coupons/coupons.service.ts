import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponType } from './coupon.entity';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

export function calculateCouponDiscount(amount: number, coupon: Coupon): number {
  const rawDiscount = coupon.type === CouponType.PERCENT
    ? amount * Number(coupon.value) / 100
    : Number(coupon.value);
  return Math.min(amount, Math.max(0, Math.round((rawDiscount + Number.EPSILON) * 100) / 100));
}

export function assertCouponUsable(
  coupon: Coupon | null,
  linkId: string,
  currency: string,
): asserts coupon is Coupon {
  if (!coupon || !coupon.isActive) {
    throw new UnprocessableEntityException('Coupon is invalid or inactive');
  }
  if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
    throw new UnprocessableEntityException('Coupon has expired');
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.redemptions + coupon.reservedRedemptions >= coupon.maxRedemptions
  ) {
    throw new UnprocessableEntityException('Coupon redemption limit reached');
  }
  if (coupon.applicableLinkIds && !coupon.applicableLinkIds.includes(linkId)) {
    throw new UnprocessableEntityException('Coupon does not apply to this payment link');
  }
  if (coupon.type === CouponType.FIXED && coupon.currency !== currency) {
    throw new UnprocessableEntityException('Coupon currency does not match payment currency');
  }
}

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon)
    private readonly repository: Repository<Coupon>,
  ) {}

  async create(merchantId: string, dto: CreateCouponDto): Promise<Coupon> {
    this.validateValue(dto.type, dto.value);
    if (dto.type === CouponType.FIXED && !dto.currency) {
      throw new BadRequestException('Fixed coupons require a currency');
    }
    const code = dto.code.trim().toUpperCase();
    if (await this.repository.findOneBy({ merchantId, code })) {
      throw new ConflictException('Coupon code already exists for this merchant');
    }
    return this.repository.save(this.repository.create({
      merchantId,
      code,
      type: dto.type,
      value: dto.value.toFixed(2),
      currency: dto.type === CouponType.FIXED ? dto.currency! : null,
      maxRedemptions: dto.maxRedemptions ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      isActive: dto.isActive ?? true,
      applicableLinkIds: dto.applicableLinkIds ?? null,
    }));
  }

  findAll(merchantId: string): Promise<Coupon[]> {
    return this.repository.find({ where: { merchantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(merchantId: string, id: string): Promise<Coupon> {
    const coupon = await this.repository.findOneBy({ id });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (coupon.merchantId !== merchantId) throw new ForbiddenException();
    return coupon;
  }

  async update(merchantId: string, id: string, dto: UpdateCouponDto): Promise<Coupon> {
    const coupon = await this.findOne(merchantId, id);
    const updatedType = dto.type ?? coupon.type;
    const updatedValue = dto.value ?? Number(coupon.value);
    this.validateValue(updatedType, updatedValue);
    if (updatedType === CouponType.FIXED && !(dto.currency ?? coupon.currency)) {
      throw new BadRequestException('Fixed coupons require a currency');
    }
    if (dto.code !== undefined) coupon.code = dto.code.trim().toUpperCase();
    if (dto.type !== undefined) coupon.type = dto.type;
    if (dto.value !== undefined) coupon.value = dto.value.toFixed(2);
    if (dto.currency !== undefined) coupon.currency = dto.currency;
    if (dto.maxRedemptions !== undefined) coupon.maxRedemptions = dto.maxRedemptions;
    if (dto.expiresAt !== undefined) coupon.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.isActive !== undefined) coupon.isActive = dto.isActive;
    if (dto.applicableLinkIds !== undefined) coupon.applicableLinkIds = dto.applicableLinkIds;
    return this.repository.save(coupon);
  }

  async remove(merchantId: string, id: string): Promise<Coupon> {
    const coupon = await this.findOne(merchantId, id);
    coupon.isActive = false;
    return this.repository.save(coupon);
  }

  async validateForPayment(
    manager: Pick<Repository<Coupon>, 'findOne'>,
    merchantId: string,
    code: string,
    linkId: string,
    currency: string,
  ): Promise<Coupon> {
    const coupon = await manager.findOne({
      where: { merchantId, code: code.trim().toUpperCase() },
      lock: { mode: 'pessimistic_write' },
    });
    assertCouponUsable(coupon, linkId, currency);
    return coupon;
  }

  async validateForLink(
    merchantId: string,
    code: string,
    linkId: string,
    currency: string,
  ): Promise<Coupon> {
    const coupon = await this.repository.findOneBy({
      merchantId,
      code: code.trim().toUpperCase(),
    });
    assertCouponUsable(coupon, linkId, currency);
    return coupon;
  }

  private validateValue(type: CouponType, value: number): void {
    if (!Number.isFinite(value) || value <= 0 || (type === CouponType.PERCENT && value > 100)) {
      throw new BadRequestException('Coupon value must be positive and percentage values cannot exceed 100');
    }
  }
}