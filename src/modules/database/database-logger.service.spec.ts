import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { DatabaseLoggerService } from './database-logger.service';
import { AppLogger } from '../logger/logger.service';

describe('DatabaseLoggerService', () => {
  let service: DatabaseLoggerService;
  let info: jest.Mock;

  beforeEach(async () => {
    info = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseLoggerService,
        {
          provide: DataSource,
          useValue: {
            isInitialized: true,
            options: {
              database: 'facilpay',
              extra: {
                min: 2,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
              },
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'DATABASE_SLOW_QUERY_THRESHOLD_MS') {
                return 500;
              }

              return defaultValue;
            }),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            child: jest.fn(() => ({ info, error: jest.fn() })),
          },
        },
      ],
    }).compile();

    service = module.get(DatabaseLoggerService);
  });

  it('logs pool configuration on bootstrap', () => {
    service.onApplicationBootstrap();

    expect(info).toHaveBeenCalledWith(
      {
        database: 'facilpay',
        pool: {
          min: 2,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
        slowQueryThresholdMs: 500,
      },
      'Database connection established',
    );
  });
});
