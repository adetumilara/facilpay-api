import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePaymentDto } from './update-payment.dto';

describe('UpdatePaymentDto', () => {
  async function validationErrors(payload: object) {
    return validate(plainToInstance(UpdatePaymentDto, payload));
  }

  it('accepts the three mutable fields', async () => {
    await expect(
      validationErrors({
        description: 'Updated description',
        metadata: { orderId: 'order-123' },
        externalReference: 'merchant-order-123',
      }),
    ).resolves.toHaveLength(0);
  });

  it('allows fields to be cleared with null', async () => {
    await expect(
      validationErrors({
        description: null,
        metadata: null,
        externalReference: null,
      }),
    ).resolves.toHaveLength(0);
  });

  it('enforces the same 20-key metadata limit as payment creation', async () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`key-${index}`, 'value']),
    );

    const errors = await validationErrors({ metadata });

    expect(errors).toEqual([expect.objectContaining({ property: 'metadata' })]);
  });

  it('requires metadata values to be strings of at most 500 characters', async () => {
    const errors = await validationErrors({
      metadata: {
        tooLong: 'x'.repeat(501),
        wrongType: 42,
      },
    });

    expect(errors).toEqual([expect.objectContaining({ property: 'metadata' })]);
  });

  it('allows immutable keys through DTO validation so the service can return 400', async () => {
    await expect(
      validationErrors({ amount: 100, status: 'COMPLETED' }),
    ).resolves.toHaveLength(0);
  });
});
