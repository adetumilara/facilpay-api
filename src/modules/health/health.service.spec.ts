import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { HealthService } from './health.service';
import { DataSource } from 'typeorm';
import { AppLogger } from '../logger/logger.service';
import { StellarHorizonStreamService } from '../stellar/stellar-horizon-stream.service';
import { StellarHorizonClientService } from '../stellar/stellar-horizon-client.service';
import { StellarService } from '../stellar/stellar.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: Partial<DataSource>;
  let mockHorizonStreamService: Partial<StellarHorizonStreamService>;
  let mockWebhooksQueue: { client: Promise<any> };
  let mockAppLogger: any;

  beforeEach(async () => {
    mockDataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    mockHorizonStreamService = {
      connected: false,
    };

    mockAppLogger = {
      child: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    };

    // Default: healthy Redis client that responds PONG
    mockWebhooksQueue = {
      client: Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: StellarHorizonStreamService,
          useValue: mockHorizonStreamService,
        },
        {
          provide: StellarHorizonClientService,
          useValue: { getStatus: jest.fn().mockReturnValue([]) },
        },
        {
          provide: StellarService,
          useValue: {
            getLowBalanceHealth: jest.fn().mockReturnValue({
              status: 'healthy',
              message: 'All configured distribution-account balances are above threshold',
              lowAssets: [],
              checkedAt: null,
            }),
          },
        },
        {
          provide: getQueueToken('webhooks'),
          useValue: mockWebhooksQueue,
        },
        { provide: AppLogger, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check() — queue field', () => {
    it('returns queue status healthy when Redis responds PONG', async () => {
      // Mock Stellar fetch to avoid real network call
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const result = await service.check();

      expect(result.services.queue).toEqual({
        status: 'healthy',
        message: 'Redis connection is healthy',
      });
    });

    it('returns queue status unhealthy and overall status degraded when Redis is down (db + stellar healthy)', async () => {
      // Stellar healthy
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      // Redis unreachable — client.ping() rejects
      const redisError = new Error('connect ECONNREFUSED 127.0.0.1:6379');
      mockWebhooksQueue.client = Promise.resolve({
        ping: jest.fn().mockRejectedValue(redisError),
      });

      const result = await service.check();

      expect(result.services.queue).toEqual({
        status: 'unhealthy',
        message: 'connect ECONNREFUSED 127.0.0.1:6379',
      });
      // database and stellar are healthy but queue is down → degraded
      expect(result.status).toBe('degraded');
      expect(result.statusCode).toBe(200);
    });

    it('returns overall status unhealthy (503) when Redis AND database are both down', async () => {
      // Stellar healthy
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      // Database unhealthy
      (mockDataSource as any).isInitialized = false;

      // Redis unreachable
      const redisError = new Error('connect ECONNREFUSED 127.0.0.1:6379');
      mockWebhooksQueue.client = Promise.resolve({
        ping: jest.fn().mockRejectedValue(redisError),
      });

      const result = await service.check();

      expect(result.services.queue.status).toBe('unhealthy');
      expect(result.services.database.status).toBe('unhealthy');
      // stellar still healthy → degraded, not fully unhealthy
      expect(result.status).toBe('degraded');
      expect(result.statusCode).toBe(200);
    });

    it('returns overall status unhealthy (503) when all three critical services are down', async () => {
      // Stellar unhealthy
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      // Database unhealthy
      (mockDataSource as any).isInitialized = false;

      // Redis unreachable
      const redisError = new Error('connect ECONNREFUSED 127.0.0.1:6379');
      mockWebhooksQueue.client = Promise.resolve({
        ping: jest.fn().mockRejectedValue(redisError),
      });

      const result = await service.check();

      expect(result.services.queue.status).toBe('unhealthy');
      expect(result.services.database.status).toBe('unhealthy');
      expect(result.services.stellar.status).toBe('unhealthy');
      expect(result.status).toBe('unhealthy');
      expect(result.statusCode).toBe(503);
    });

    it('returns queue status unhealthy when client promise itself rejects', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      // The client promise itself rejects (e.g. queue never connected).
      // Attach a no-op catch to prevent Node from surfacing an unhandled
      // rejection before HealthService.checkQueue() awaits it.
      const rejectedClient = Promise.reject(new Error('Queue client unavailable'));
      rejectedClient.catch(() => undefined);
      mockWebhooksQueue.client = rejectedClient;

      const result = await service.check();

      expect(result.services.queue).toEqual({
        status: 'unhealthy',
        message: 'Queue client unavailable',
      });
    });
  });

  it('returns degraded readiness when a configured distribution balance is low', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const stellarService = (service as any).stellarService as StellarService;
    jest.spyOn(stellarService, 'getLowBalanceHealth').mockReturnValue({
      status: 'degraded',
      message: 'Below threshold: XLM',
      lowAssets: ['XLM'],
      checkedAt: new Date().toISOString(),
    });

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.statusCode).toBe(200);
    expect(result.services.stellarDistributionAccount.lowAssets).toEqual(['XLM']);
  });
});
