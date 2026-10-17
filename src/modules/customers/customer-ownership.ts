import { BadRequestException } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { Customer } from './customer.entity';

export async function resolveCustomerForMerchant(
  customerRepository: Repository<Customer>,
  customerId: string,
  authenticatedMerchantId: string,
  requestedMerchantId?: string,
): Promise<Customer> {
  const customer = await customerRepository.findOneBy({
    id: customerId,
    deletedAt: IsNull(),
  });

  if (
    !customer ||
    customer.merchantId !== authenticatedMerchantId ||
    (requestedMerchantId !== undefined &&
      requestedMerchantId !== customer.merchantId)
  ) {
    throw new BadRequestException(
      'Invalid customerId: customer does not exist or does not belong to this merchant',
    );
  }

  return customer;
}
