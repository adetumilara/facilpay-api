import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { Customer } from '../src/modules/customers/customer.entity';
import { CustomersController } from '../src/modules/customers/customers.controller';
import { CustomersService } from '../src/modules/customers/customers.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

class UniqueCustomerEmailError extends Error {
  readonly driverError = { code: '23505' };

  constructor() {
    super('Unique customer email');
  }
}

class InMemoryCustomerRepository {
  customers: Customer[] = [];

  create(data: Partial<Customer>): Customer {
    return {
      id: randomUUID(),
      merchantId: '',
      email: '',
      name: null,
      phone: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...data,
    } as Customer;
  }

  save(customer: Customer): Promise<Customer> {
    const duplicate = this.customers.some(
      (existing) =>
        existing.id !== customer.id &&
        existing.merchantId === customer.merchantId &&
        existing.email.toLowerCase() === customer.email.toLowerCase() &&
        existing.deletedAt === null,
    );
    if (duplicate) {
      throw new UniqueCustomerEmailError();
    }

    const existingIndex = this.customers.findIndex(
      (existing) => existing.id === customer.id,
    );
    customer.updatedAt = new Date();
    if (existingIndex >= 0) {
      this.customers[existingIndex] = customer;
    } else {
      this.customers.push(customer);
    }
    return Promise.resolve(customer);
  }

  findOneBy(criteria: {
    id: string;
    merchantId: string;
  }): Promise<Customer | null> {
    return Promise.resolve(
      this.customers.find(
        (customer) =>
          customer.id === criteria.id &&
          customer.merchantId === criteria.merchantId &&
          customer.deletedAt === null,
      ) ?? null,
    );
  }

  softDelete(id: string): Promise<void> {
    const customer = this.customers.find((entry) => entry.id === id);
    if (customer) customer.deletedAt = new Date();
    return Promise.resolve();
  }

  createQueryBuilder() {
    return new InMemoryCustomerQueryBuilder(this);
  }
}

class InMemoryCustomerQueryBuilder {
  private merchantId = '';
  private search = '';

  constructor(private readonly repository: InMemoryCustomerRepository) {}

  where(sql: string, parameters: { merchantId: string }): this {
    if (sql.includes('customer.merchantId')) {
      this.merchantId = parameters.merchantId;
    }
    return this;
  }

  andWhere(sql: string, parameters?: { search: string }): this {
    if (!sql.includes('customer.deletedAt IS NULL') && parameters?.search) {
      this.search = parameters.search.toLowerCase();
    }
    return this;
  }

  orderBy(): this {
    return this;
  }

  addOrderBy(): this {
    return this;
  }

  skip(): this {
    return this;
  }

  take(): this {
    return this;
  }

  getManyAndCount(): Promise<[Customer[], number]> {
    const normalizedSearch = this.search.replace(/^%|%$/g, '');
    const data = this.repository.customers.filter(
      (customer) =>
        customer.merchantId === this.merchantId &&
        customer.deletedAt === null &&
        (!normalizedSearch ||
          customer.email.toLowerCase().includes(normalizedSearch) ||
          customer.name?.toLowerCase().includes(normalizedSearch)),
    );
    return Promise.resolve([data, data.length]);
  }
}

describe('Customers resource (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryCustomerRepository;

  beforeAll(async () => {
    repository = new InMemoryCustomerRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        CustomersService,
        {
          provide: getRepositoryToken(Customer),
          useValue: repository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => any };
        }) => {
          const requestContext = context.switchToHttp().getRequest();
          requestContext.user = {
            id: requestContext.headers['x-merchant-id'],
          };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    repository.customers = [];
  });

  afterAll(async () => {
    await app.close();
  });

  const asMerchant = (merchantId: string) => ({
    get: (path: string) =>
      request(app.getHttpServer()).get(path).set('x-merchant-id', merchantId),
  });

  it('creates and retrieves a merchant-scoped customer', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/v1/customers')
      .set('x-merchant-id', 'merchant-1')
      .send({
        email: 'Jane.Doe@Example.com',
        name: 'Jane Doe',
        metadata: { tier: 'gold' },
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      merchantId: 'merchant-1',
      email: 'jane.doe@example.com',
      name: 'Jane Doe',
    });

    const getResponse = await asMerchant('merchant-1')
      .get(`/v1/customers/${createResponse.body.id}`)
      .expect(200);
    expect(getResponse.body.id).toBe(createResponse.body.id);
  });

  it('rejects a duplicate email case-insensitively for the same merchant', async () => {
    await request(app.getHttpServer())
      .post('/v1/customers')
      .set('x-merchant-id', 'merchant-1')
      .send({ email: 'jane@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/customers')
      .set('x-merchant-id', 'merchant-1')
      .send({ email: 'JANE@EXAMPLE.COM' })
      .expect(409);
  });

  it('does not list or expose another merchant customer', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/customers')
      .set('x-merchant-id', 'merchant-1')
      .send({ email: 'private@example.com' })
      .expect(201);

    const list = await asMerchant('merchant-2')
      .get('/v1/customers')
      .expect(200);
    expect(list.body).toMatchObject({ data: [], total: 0 });

    await asMerchant('merchant-2')
      .get(`/v1/customers/${created.body.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/v1/customers/${created.body.id}`)
      .set('x-merchant-id', 'merchant-2')
      .send({ name: 'Stolen' })
      .expect(404);
  });

  it('searches by email or name and paginates', async () => {
    await request(app.getHttpServer())
      .post('/v1/customers')
      .set('x-merchant-id', 'merchant-1')
      .send({ email: 'alice@example.com', name: 'Alice Example' })
      .expect(201);

    const response = await asMerchant('merchant-1')
      .get('/v1/customers?search=ALICE&page=1&limit=5')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].email).toBe('alice@example.com');
  });

  it('soft-deletes a customer and hides it from later reads', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/customers')
      .set('x-merchant-id', 'merchant-1')
      .send({ email: 'delete@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/customers/${created.body.id}`)
      .set('x-merchant-id', 'merchant-1')
      .expect(204);

    await asMerchant('merchant-1')
      .get(`/v1/customers/${created.body.id}`)
      .expect(404);
  });
});
