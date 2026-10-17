import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import {
  WebhookDeliveryService,
  BACKOFF_DELAYS_MS,
  MAX_ATTEMPTS,
} from './webhook-delivery.service';
import { WebhookDelivery, WebhookDeliveryStatus } from './webhook-delivery.entity';
import { AppLogger } from '../logger/logger.service';
import { Payment, PaymentStatus } from './payment.entity';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

const mockHttpService = () => ({
  post: jest.fn(),
});

const childLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockAppLogger = {
  child: jest.fn().mockReturnValue(childLogger),
};

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;
  let repo: ReturnType<typeof mockRepo>;
  let httpService: ReturnType<typeof mockHttpService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        { provide: getRepositoryToken(WebhookDelivery), useFactory: mockRepo },
        { provide: HttpService, useFactory: mockHttpService },
        { provide: AppLogger, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get(WebhookDeliveryService);
    repo = module.get(getRepositoryToken(WebhookDelivery));
    httpService = module.get(HttpService);
  });

  describe('enqueue', () => {
    it('creates a PENDING delivery row with attemptCount=0 and nextRetryAt=now', async () => {
      const payment = {
        id: 'pay-1',
        callbackUrl: 'https://merchant.example.com/webhook',
        status: PaymentStatus.COMPLETED,
        amount: 100,
        currency: 'USD',
        externalReference: 'ext-1',
        updatedAt: new Date(),
      } as Payment;

      const deliveryStub = { id: 'del-1' };
      repo.create.mockReturnValue(deliveryStub);
      repo.save.mockResolvedValue(deliveryStub);

      await service.enqueue(payment);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay-1',
          callbackUrl: 'https://merchant.example.com/webhook',
          status: WebhookDeliveryStatus.PENDING,
          attemptCount: 0,
        }),
      );
      expect(repo.save).toHaveBeenCalledWith(deliveryStub);
    });

    it('does nothing when payment has no callbackUrl', async () => {
      const payment = { id: 'pay-1', callbackUrl: null } as Payment;
      await service.enqueue(payment);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('stores a payload snapshot with paymentId, status, amount, currency', async () => {
      const payment = {
        id: 'pay-1',
        callbackUrl: 'https://example.com/hook',
        status: PaymentStatus.COMPLETED,
        amount: 50.0,
        currency: 'NGN',
        externalReference: 'ref-x',
        updatedAt: new Date('2026-06-20T10:00:00Z'),
      } as Payment;

      repo.create.mockReturnValue({});
      repo.save.mockResolvedValue({});

      await service.enqueue(payment);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            paymentId: 'pay-1',
            status: PaymentStatus.COMPLETED,
            amount: 50.0,
            currency: 'NGN',
          }),
        }),
      );
    });
  });

  describe('attempt', () => {
    it('marks delivery DELIVERED and records status code on 2xx response', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://merchant.example.com/webhook',
        payload: { paymentId: 'pay-1', status: 'COMPLETED' },
        attemptCount: 0,
        status: WebhookDeliveryStatus.PENDING,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(of({ status: 200, data: {} }));
      repo.save.mockResolvedValue(delivery);

      await service.attempt(delivery);

      expect(delivery.status).toBe(WebhookDeliveryStatus.DELIVERED);
      expect(delivery.attemptCount).toBe(1);
      expect(delivery.lastStatusCode).toBe(200);
      expect(delivery.nextRetryAt).toBeNull();
      expect(repo.save).toHaveBeenCalledWith(delivery);
    });

    it('marks delivery FAILED and sets nextRetryAt after first failure', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://merchant.example.com/webhook',
        payload: {},
        attemptCount: 0,
        status: WebhookDeliveryStatus.PENDING,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 500 }, message: 'Server error' })),
      );
      repo.save.mockResolvedValue(delivery);

      const before = Date.now();
      await service.attempt(delivery);

      expect(delivery.status).toBe(WebhookDeliveryStatus.FAILED);
      expect(delivery.attemptCount).toBe(1);
      expect(delivery.lastStatusCode).toBe(500);
      expect(delivery.nextRetryAt).not.toBeNull();
      expect(delivery.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(
        before + BACKOFF_DELAYS_MS[0],
      );
    });

    it('marks delivery DEAD after MAX_ATTEMPTS failures', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://merchant.example.com/webhook',
        payload: {},
        attemptCount: MAX_ATTEMPTS - 1,
        status: WebhookDeliveryStatus.FAILED,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );
      repo.save.mockResolvedValue(delivery);

      await service.attempt(delivery);

      expect(delivery.status).toBe(WebhookDeliveryStatus.DEAD);
      expect(delivery.attemptCount).toBe(MAX_ATTEMPTS);
      expect(delivery.nextRetryAt).toBeNull();
    });

    it.each([
      [0, 60_000],
      [1, 300_000],
      [2, 1_800_000],
      [3, 7_200_000],
    ])(
      'sets nextRetryAt to +%i ms after attempt %i fails',
      async (attemptCount, expectedDelayMs) => {
        const delivery = {
          id: `del-${attemptCount}`,
          paymentId: 'pay-1',
          callbackUrl: 'https://example.com',
          payload: {},
          attemptCount,
          status: WebhookDeliveryStatus.PENDING,
        } as WebhookDelivery;

        httpService.post.mockReturnValue(throwError(() => new Error('fail')));
        repo.save.mockResolvedValue(delivery);

        const before = Date.now();
        await service.attempt(delivery);

        expect(delivery.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(
          before + expectedDelayMs,
        );
        expect(delivery.nextRetryAt!.getTime()).toBeLessThan(
          before + expectedDelayMs + 500,
        );
      },
    );

    it('records lastError from network failure', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://merchant.example.com/webhook',
        payload: {},
        attemptCount: 0,
        status: WebhookDeliveryStatus.PENDING,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(
        throwError(() => new Error('connect ECONNREFUSED 127.0.0.1:3001')),
      );
      repo.save.mockResolvedValue(delivery);

      await service.attempt(delivery);

      expect(delivery.lastError).toBe('connect ECONNREFUSED 127.0.0.1:3001');
    });

    it('emits a structured log event on success', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://example.com',
        payload: {},
        attemptCount: 0,
        status: WebhookDeliveryStatus.PENDING,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(of({ status: 201, data: {} }));
      repo.save.mockResolvedValue(delivery);

      await service.attempt(delivery);

      expect(childLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'webhook_delivery_succeeded' }),
        expect.any(String),
      );
    });

    it('emits a structured log event on failure', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://example.com',
        payload: {},
        attemptCount: 0,
        status: WebhookDeliveryStatus.PENDING,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(throwError(() => new Error('fail')));
      repo.save.mockResolvedValue(delivery);

      await service.attempt(delivery);

      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'webhook_delivery_failed' }),
        expect.any(String),
      );
    });

    it('emits a structured log event when delivery is marked DEAD', async () => {
      const delivery = {
        id: 'del-1',
        paymentId: 'pay-1',
        callbackUrl: 'https://example.com',
        payload: {},
        attemptCount: MAX_ATTEMPTS - 1,
        status: WebhookDeliveryStatus.FAILED,
      } as WebhookDelivery;

      httpService.post.mockReturnValue(throwError(() => new Error('fail')));
      repo.save.mockResolvedValue(delivery);

      await service.attempt(delivery);

      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'webhook_delivery_dead' }),
        expect.any(String),
      );
    });
  });

  describe('findDue', () => {
    it('queries for PENDING and FAILED deliveries with nextRetryAt <= now', async () => {
      repo.find.mockResolvedValue([]);
      await service.findDue();
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([
            expect.objectContaining({ status: WebhookDeliveryStatus.PENDING }),
            expect.objectContaining({ status: WebhookDeliveryStatus.FAILED }),
          ]),
        }),
      );
    });
  });

  describe('findByPaymentId', () => {
    it('returns deliveries for the given paymentId ordered by createdAt DESC', async () => {
      const deliveries = [{ id: 'del-1' }, { id: 'del-2' }] as WebhookDelivery[];
      repo.find.mockResolvedValue(deliveries);

      const result = await service.findByPaymentId('pay-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { paymentId: 'pay-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toBe(deliveries);
    });
  });
});
