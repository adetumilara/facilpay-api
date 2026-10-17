import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MaintenanceService } from './maintenance.service';
import { AppLogger } from '../logger/logger.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let configService: ConfigService;
  let dataSource: DataSource;
  let appLogger: AppLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, number> = {
                RETENTION_API_KEY_USAGE_DAYS: 30,
                RETENTION_WEBHOOK_DELIVERIES_DAYS: 90,
                RETENTION_EMAIL_LOGS_DAYS: 60,
                RETENTION_AUDIT_LOGS_DAYS: 365,
              };
              return config[key];
            }),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            child: jest.fn().mockReturnValue({
              info: jest.fn(),
              error: jest.fn(),
              warn: jest.fn(),
              debug: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    configService = module.get<ConfigService>(ConfigService);
    dataSource = module.get<DataSource>(DataSource);
    appLogger = module.get<AppLogger>(AppLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purgeOldData', () => {
    it('should purge old data from all configured tables', async () => {
      await service.purgeOldData();

      expect(appLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'MaintenanceService',
          action: 'purgeOldData',
        }),
      );
    });

    it('should skip tables with retention days = 0 (keep forever)', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'RETENTION_API_KEY_USAGE_DAYS') return 0;
        return null;
      });

      await service.purgeOldData();

      // Should not query for tables with 0 retention
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('should enforce minimum retention for audit logs', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'RETENTION_AUDIT_LOGS_DAYS') return 100; // Below 365 minimum
        return 30;
      });

      await service.purgeOldData();

      // Audit logs should not be deleted
      expect(dataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining('audit_logs'),
        expect.anything(),
      );
    });
  });
});
