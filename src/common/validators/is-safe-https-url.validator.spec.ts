import { isSafeHttpsUrl } from './is-safe-https-url.validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePaymentLinkDto } from '../../modules/payment-links/dto/create-payment-link.dto';
import { resolvePaymentLinkSuccessUrl } from '../../modules/payment-links/payment-links.service';

describe('isSafeHttpsUrl', () => {
  it('accepts public HTTPS URLs up to 2048 characters', () => {
    expect(isSafeHttpsUrl('https://merchant.example.com/paid')).toBe(true);
    expect(isSafeHttpsUrl(`https://merchant.example.com/${'a'.repeat(2010)}`)).toBe(true);
  });

  it('rejects non-HTTPS, local, private, credentialed, and oversized URLs', () => {
    expect(isSafeHttpsUrl('http://merchant.example.com')).toBe(false);
    expect(isSafeHttpsUrl('https://localhost/')).toBe(false);
    expect(isSafeHttpsUrl('https://192.168.1.10/')).toBe(false);
    expect(isSafeHttpsUrl('https://[::ffff:7f00:1]/')).toBe(false);
    expect(isSafeHttpsUrl('https://printer/')).toBe(false);
    expect(isSafeHttpsUrl('https://user:pass@merchant.example.com/')).toBe(false);
    expect(isSafeHttpsUrl(`https://merchant.example.com/${'a'.repeat(2040)}`)).toBe(false);
  });

  it('validates redirect URLs at the DTO boundary and permits the payment placeholder', () => {
    const valid = plainToInstance(CreatePaymentLinkDto, {
      amount: 25,
      currency: 'USD',
      successUrl: 'https://merchant.example.com/paid?payment_id={PAYMENT_ID}',
    });
    const invalid = plainToInstance(CreatePaymentLinkDto, {
      amount: 25,
      currency: 'USD',
      successUrl: 'http://merchant.example.com/paid',
    });

    expect(validateSync(valid).some((error) => error.property === 'successUrl')).toBe(false);
    expect(validateSync(invalid).some((error) => error.property === 'successUrl')).toBe(true);
  });

  it('replaces the payment ID placeholder in the success URL', () => {
    expect(
      resolvePaymentLinkSuccessUrl(
        'https://merchant.example.com/paid?payment_id={PAYMENT_ID}',
        'payment-123',
      ),
    ).toBe('https://merchant.example.com/paid?payment_id=payment-123');
  });
});