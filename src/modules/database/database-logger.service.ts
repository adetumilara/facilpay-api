import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Logger } from 'pino';
import { AppLogger } from '../logger/logger.service';

type PoolExtraOptions = {
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
};

@Injectable()
export class DatabaseLoggerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger: Logger;
  private readonly slowQueryThresholdMs: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: DatabaseLoggerService.name });
    this.slowQueryThresholdMs = this.configService.get<number>(
      'DATABASE_SLOW_QUERY_THRESHOLD_MS',
      500,
    );
  }

  onApplicationBootstrap() {
    if (this.dataSource.isInitialized) {
      const extra = this.dataSource.options.extra as
        | PoolExtraOptions
        | undefined;

      this.logger.info(
        {
          database: this.dataSource.options.database,
          pool: {
            min: extra?.min,
            max: extra?.max,
            idleTimeoutMillis: extra?.idleTimeoutMillis,
            connectionTimeoutMillis: extra?.connectionTimeoutMillis,
          },
          slowQueryThresholdMs: this.slowQueryThresholdMs,
        },
        'Database connection established',
      );
    } else {
      this.logger.error('Database connection not initialized');
    }
  }

  onApplicationShutdown(signal?: string) {
    this.logger.info({ signal }, 'Database connection shutdown');
  }
}
