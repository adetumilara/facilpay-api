import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { Product } from '../src/modules/products/product.entity';
import { ProductsController } from '../src/modules/products/products.controller';
import { ProductsService } from '../src/modules/products/products.service';
import { Invoice } from '../src/modules/invoices/invoice.entity';
import { InvoicesController } from '../src/modules/invoices/invoices.controller';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { CheckoutSession, CheckoutSessionStatus } from '../src/modules/checkout-sessions/entities/checkout-session.entity';
import { CheckoutSessionsController } from '../src/modules/checkout-sessions/checkout-sessions.controller';
import { CheckoutSessionsService } from '../src/modules/checkout-sessions/checkout-sessions.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

class InMemoryProductRepository {
  products: Product[] = [];

  create(data: Partial<Product>): Product {
    return {
      id: randomUUID(),
      merchantId: '',
      name: '',
      description: null,
      unitAmount: '0.00',
      currency: 'USD',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...data,
    } as Product;
  }

  save(product: Product): Promise<Product> {
    const existingIndex = this.products.findIndex((p) => p.id === product.id);
    product.updatedAt = new Date();
    if (existingIndex >= 0) {
      this.products[existingIndex] = product;
    } else {
      this.products.push(product);
    }
    return Promise.resolve(product);
  }

  find(options?: { where?: { merchantId?: string; deletedAt?: any } }): Promise<Product[]> {
    return Promise.resolve(
      this.products.filter(
        (p) =>
          (!options?.where?.merchantId || p.merchantId === options.where.merchantId) &&
          p.deletedAt === null,
      ),
    );
  }

  findOneBy(criteria: Partial<Product>): Promise<Product | null> {
    return Promise.resolve(
      this.products.find(
        (p) =>
          (!criteria.id || p.id === criteria.id) &&
          (!criteria.merchantId || p.merchantId === criteria.merchantId) &&
          p.deletedAt === null,
      ) ?? null,
    );
  }
}

class InMemoryInvoiceRepository {
  invoices: Invoice[] = [];

  save(invoice: Invoice): Promise<Invoice> {
    if (!invoice.id) invoice.id = randomUUID();
    this.invoices.push(invoice);
    return Promise.resolve(invoice);
  }

  find(): Promise<Invoice[]> {
    return Promise.resolve(this.invoices);
  }

  findOne(): Promise<Invoice | null> {
    return Promise.resolve(null);
  }

  createQueryBuilder() {
    return {
      update: () => ({ set: () => ({ where: () => ({ andWhere: () => ({ execute: () => Promise.resolve({ affected: 1 }) }) }) }) }),
    };
  }
}

class InMemoryCheckoutSessionRepository {
  sessions: CheckoutSession[] = [];

  create(data: Partial<CheckoutSession>): CheckoutSession {
    return {
      id: randomUUID(),
      publicId: 'pub123',
      merchantId: '',
      lineItems: [],
      currency: 'USD',
      total: 0,
      customerId: null,
      customerEmail: null,
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(),
      status: CheckoutSessionStatus.OPEN,
      paymentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    } as CheckoutSession;
  }

  save(session: CheckoutSession): Promise<CheckoutSession> {
    this.sessions.push(session);
    return Promise.resolve(session);
  }

  find(): Promise<CheckoutSession[]> {
    return Promise.resolve(this.sessions);
  }
}

describe('Products and Catalog Integration (e2e)', () => {
  let app: INestApplication<App>;
  let productRepo: InMemoryProductRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let sessionRepo: InMemoryCheckoutSessionRepository;

  beforeAll(async () => {
    productRepo = new InMemoryProductRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    sessionRepo = new InMemoryCheckoutSessionRepository();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        ProductsController,
        InvoicesController,
        CheckoutSessionsController,
      ],
      providers: [
        ProductsService,
        InvoicesService,
        CheckoutSessionsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(CheckoutSession), useValue: sessionRepo },
        {
          provide: 'DataSource',
          useValue: {
            createQueryRunner: () => ({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              query: jest.fn().mockResolvedValue([{ nextNumber: 1 }]),
              manager: {
                create: (_e: any, d: any) => d,
                save: async (inv: any) => {
                  inv.id = randomUUID();
                  invoiceRepo.invoices.push(inv);
                  return inv;
                },
              },
            }),
          },
        },
        { provide: 'EmailNotificationService', useValue: { sendInvoiceCreated: jest.fn() } },
        { provide: 'PaymentsService', useValue: { createForInvoice: jest.fn() } },
        { provide: 'MerchantsService', useValue: { getBrandingWithDefaults: jest.fn().mockResolvedValue({}) } },
        { provide: 'WebhooksService', useValue: { dispatchEventToMerchant: jest.fn() } },
        { provide: 'ConfigService', useValue: { get: jest.fn() } },
        { provide: 'AppLogger', useValue: { child: () => ({ info: jest.fn(), error: jest.fn() }) } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => any };
        }) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: req.headers['x-merchant-id'] };
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

  afterAll(async () => {
    await app.close();
  });

  it('performs CRUD on products and archives instead of hard deleting', async () => {
    // 1. Create product
    const createRes = await request(app.getHttpServer())
      .post('/v1/products')
      .set('x-merchant-id', 'merchant-1')
      .send({
        name: 'SaaS Subscription',
        description: 'Pro tier',
        unitAmount: 49.99,
        currency: 'USD',
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      name: 'SaaS Subscription',
      unitAmount: '49.99',
      currency: 'USD',
      isActive: true,
    });
    const productId = createRes.body.id;

    // 2. Get product
    const getRes = await request(app.getHttpServer())
      .get(`/v1/products/${productId}`)
      .set('x-merchant-id', 'merchant-1')
      .expect(200);
    expect(getRes.body.id).toBe(productId);

    // 3. Archive product (DELETE sets active = false)
    const deleteRes = await request(app.getHttpServer())
      .delete(`/v1/products/${productId}`)
      .set('x-merchant-id', 'merchant-1')
      .expect(200);
    expect(deleteRes.body.isActive).toBe(false);
  });

  it('creates an invoice referencing a product and snapshots the price', async () => {
    const prod = productRepo.create({
      merchantId: 'merchant-1',
      name: 'Consulting Hour',
      unitAmount: '150.00',
      currency: 'USD',
      isActive: true,
    });
    await productRepo.save(prod);

    const invoiceRes = await request(app.getHttpServer())
      .post('/v1/invoices')
      .set('x-merchant-id', 'merchant-1')
      .send({
        customerEmail: 'client@example.com',
        currency: 'USD',
        dueDate: '2026-12-31T00:00:00.000Z',
        lineItems: [
          {
            productId: prod.id,
            quantity: 2,
          },
        ],
      })
      .expect(201);

    expect(invoiceRes.body.total).toBe('300.00');
    expect(invoiceRes.body.lineItems[0]).toMatchObject({
      description: 'Consulting Hour',
      unitPrice: '150.00',
      amount: '300.00',
      productId: prod.id,
    });
  });

  it('creates a checkout session referencing a product', async () => {
    const prod = productRepo.create({
      merchantId: 'merchant-1',
      name: 'E-book',
      unitAmount: '19.99',
      currency: 'USD',
      isActive: true,
    });
    await productRepo.save(prod);

    const sessionRes = await request(app.getHttpServer())
      .post('/v1/checkout/sessions')
      .set('x-merchant-id', 'merchant-1')
      .send({
        currency: 'USD',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        lineItems: [
          {
            productId: prod.id,
            quantity: 3,
          },
        ],
      })
      .expect(201);

    expect(sessionRes.body.total).toBe(5997); // 3 * 19.99 * 100
    expect(sessionRes.body.lineItems[0]).toMatchObject({
      productId: prod.id,
      name: 'E-book',
      quantity: 3,
      unitAmount: 1999,
    });
  });
});
