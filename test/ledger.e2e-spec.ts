import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { LedgerController } from '../src/modules/ledger/ledger.controller';
import { LedgerService } from '../src/modules/ledger/ledger.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('Merchant ledger endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const ledgerService = {
    getBalance: jest.fn(),
    findLedger: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [{ provide: LedgerService, useValue: ledgerService }],
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
    jest.clearAllMocks();
    ledgerService.getBalance.mockResolvedValue({
      merchantId: 'merchant-1',
      balances: [{ currency: 'USD', account: 'AVAILABLE', balance: '10' }],
    });
    ledgerService.findLedger.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a balance scoped to the authenticated merchant', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/merchants/me/balance?currency=usd')
      .set('x-merchant-id', 'merchant-1')
      .expect(200);

    expect(response.body.merchantId).toBe('merchant-1');
    expect(ledgerService.getBalance).toHaveBeenCalledWith('merchant-1', 'usd');
  });

  it('returns paginated ledger entries with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/merchants/me/ledger?page=2&limit=10&account=AVAILABLE')
      .set('x-merchant-id', 'merchant-1')
      .expect(200);

    expect(response.body).toMatchObject({ total: 0, page: 1, limit: 20 });
    expect(ledgerService.findLedger).toHaveBeenCalledWith(
      'merchant-1',
      expect.objectContaining({ page: 2, limit: 10, account: 'AVAILABLE' }),
    );
  });

  it('rejects unsupported account filters', async () => {
    await request(app.getHttpServer())
      .get('/v1/merchants/me/ledger?account=NOT_AN_ACCOUNT')
      .set('x-merchant-id', 'merchant-1')
      .expect(400);
    expect(ledgerService.findLedger).not.toHaveBeenCalled();
  });
});
