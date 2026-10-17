import { BadRequestException } from '@nestjs/common';
import { resolveCustomerForMerchant } from './customer-ownership';
import { Customer } from './customer.entity';
import { Repository } from 'typeorm';

describe('resolveCustomerForMerchant', () => {
  const repository = {
    findOneBy: jest.fn(),
  } as unknown as Repository<Customer>;
  const findOneByMock = repository.findOneBy as jest.Mock;

  beforeEach(() => {
    findOneByMock.mockReset();
  });

  it('returns an active customer owned by the authenticated merchant', async () => {
    const customer = {
      id: 'customer-1',
      merchantId: 'merchant-1',
    } as Customer;
    findOneByMock.mockResolvedValueOnce(customer);

    await expect(
      resolveCustomerForMerchant(repository, 'customer-1', 'merchant-1'),
    ).resolves.toBe(customer);
    expect(findOneByMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'customer-1' }),
    );
  });

  it('rejects a customer owned by another merchant without disclosing it', async () => {
    findOneByMock.mockResolvedValueOnce({
      id: 'customer-1',
      merchantId: 'merchant-2',
    } as Customer);

    await expect(
      resolveCustomerForMerchant(repository, 'customer-1', 'merchant-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a requested merchant that differs from the customer owner', async () => {
    findOneByMock.mockResolvedValueOnce({
      id: 'customer-1',
      merchantId: 'merchant-1',
    } as Customer);

    await expect(
      resolveCustomerForMerchant(
        repository,
        'customer-1',
        'merchant-1',
        'merchant-2',
      ),
    ).rejects.toThrow(
      'Invalid customerId: customer does not exist or does not belong to this merchant',
    );
  });

  it('rejects a missing or soft-deleted customer', async () => {
    findOneByMock.mockResolvedValueOnce(null);

    await expect(
      resolveCustomerForMerchant(repository, 'missing', 'merchant-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
