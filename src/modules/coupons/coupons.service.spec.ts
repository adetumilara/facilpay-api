import { UnprocessableEntityException } from '@nestjs/common';
import { Coupon, CouponType } from './coupon.entity';
import { calculateCouponDiscount, CouponsService } from './coupons.service';

describe('CouponsService', () => {
  const makeCoupon = (overrides: Partial<Coupon> = {}) => ({
    id: 'coupon-id',
    merchantId: 'merchant-id',
    code: 'SAVE20',
    type: CouponType.PERCENT,
    value: '20.00',
    currency: null,
    maxRedemptions: 5,
    redemptions: 0,
    reservedRedemptions: 0,
    expiresAt: null,
    isActive: true,
    applicableLinkIds: null,
    ...overrides,
  }) as Coupon;

  it('calculates percentage discounts to currency precision', () => {
    expect(calculateCouponDiscount(24.99, makeCoupon())).toBe(5);
  });

  it('clamps fixed discounts at the full amount and never returns a negative charge', () => {
    const discount = calculateCouponDiscount(
      10,
      makeCoupon({ type: CouponType.FIXED, value: '50.00', currency: 'USD' }),
    );
    expect(discount).toBe(10);
    expect(10 - discount).toBeGreaterThanOrEqual(0);
  });

  it('looks up normalized codes under a pessimistic lock and counts reservations against limits', async () => {
    const coupon = makeCoupon({ reservedRedemptions: 1, maxRedemptions: 2 });
    const findOne = jest.fn().mockResolvedValue(coupon);
    const service = new CouponsService({} as any);

    await expect(service.validateForPayment({ findOne } as any, 'merchant-id', 'save20', 'link-id', 'USD'))
      .resolves.toBe(coupon);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: 'merchant-id', code: 'SAVE20' },
      lock: { mode: 'pessimistic_write' },
    }));
  });

  it('rejects exhausted and expired coupons', async () => {
    const service = new CouponsService({
      findOne: jest.fn()
        .mockResolvedValueOnce(makeCoupon({ reservedRedemptions: 1, maxRedemptions: 1 }))
        .mockResolvedValueOnce(makeCoupon({ expiresAt: new Date(Date.now() - 1000) })),
    } as any);

    await expect(service.validateForPayment({ findOne: service['repository'].findOne } as any, 'merchant-id', 'save20', 'link-id', 'USD'))
      .rejects.toThrow(UnprocessableEntityException);
    await expect(service.validateForPayment({ findOne: service['repository'].findOne } as any, 'merchant-id', 'save20', 'link-id', 'USD'))
      .rejects.toThrow('Coupon has expired');
  });
});