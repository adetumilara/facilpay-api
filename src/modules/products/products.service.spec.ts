import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: any;

  const makeProduct = (overrides: Partial<Product> = {}) =>
    ({
      id: 'prod-1',
      merchantId: 'merchant-1',
      name: 'Test Product',
      description: 'A test product',
      unitAmount: '10.00',
      currency: 'USD',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as Product;

  beforeEach(() => {
    repository = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (product) => ({ id: 'prod-1', ...product })),
      find: jest.fn(),
      findOneBy: jest.fn(),
    };
    service = new ProductsService(repository);
  });

  it('creates a product', async () => {
    const dto = {
      name: '  New Product  ',
      description: '  Desc  ',
      unitAmount: 25.5,
      currency: 'usd',
    };
    const result = await service.create('merchant-1', dto);
    expect(result).toMatchObject({
      merchantId: 'merchant-1',
      name: 'New Product',
      description: 'Desc',
      unitAmount: '25.50',
      currency: 'USD',
      isActive: true,
    });
  });

  it('finds one product and checks merchant ownership', async () => {
    repository.findOneBy.mockResolvedValue(makeProduct());
    const product = await service.findOne('merchant-1', 'prod-1');
    expect(product.id).toBe('prod-1');

    repository.findOneBy.mockResolvedValue(makeProduct({ merchantId: 'other-merchant' }));
    await expect(service.findOne('merchant-1', 'prod-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('archives instead of hard deleting (sets active to false)', async () => {
    const product = makeProduct();
    repository.findOneBy.mockResolvedValue(product);

    const archived = await service.remove('merchant-1', 'prod-1');
    expect(archived.isActive).toBe(false);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('validates product for invoice/checkout usage (existence, active, currency)', async () => {
    const product = makeProduct({ currency: 'USD', isActive: true });
    repository.findOneBy.mockResolvedValue(product);

    const validated = await service.validateAndGetProduct(
      'merchant-1',
      'prod-1',
      'USD',
    );
    expect(validated).toBe(product);

    // Mismatched currency
    await expect(
      service.validateAndGetProduct('merchant-1', 'prod-1', 'EUR'),
    ).rejects.toThrow(BadRequestException);

    // Inactive product
    repository.findOneBy.mockResolvedValue(
      makeProduct({ isActive: false }),
    );
    await expect(
      service.validateAndGetProduct('merchant-1', 'prod-1', 'USD'),
    ).rejects.toThrow(BadRequestException);
  });
});
