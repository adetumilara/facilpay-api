import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseLoggerService } from './database-logger.service';
import { AppLogger } from '../logger/logger.service';
import { TypeOrmSlowQueryLogger } from './typeorm-slow-query.logger';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, AppLogger],
      useFactory: (configService: ConfigService, appLogger: AppLogger) => {
        const slowQueryThresholdMs = configService.get<number>(
          'DATABASE_SLOW_QUERY_THRESHOLD_MS',
          500,
        );
        const isDevelopment =
          configService.get<string>('NODE_ENV') === 'development';

        return {
          type: 'postgres' as const,
          host: configService.get<string>('DATABASE_HOST', 'localhost'),
          port: configService.get<number>('DATABASE_PORT', 5432),
          username: configService.get<string>('DATABASE_USERNAME', 'postgres'),
          password: configService.get<string>('DATABASE_PASSWORD', 'password'),
          database: configService.get<string>('DATABASE_NAME', 'facilpay'),
          entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
          synchronize:
            configService.get<string>('DATABASE_SYNCHRONIZE', 'false') ===
            'true',
          extra: {
            min: configService.get<number>('DATABASE_POOL_MIN', 2),
            max: configService.get<number>('DATABASE_POOL_MAX', 10),
            idleTimeoutMillis: configService.get<number>(
              'DATABASE_POOL_IDLE_TIMEOUT_MS',
              30000,
            ),
            connectionTimeoutMillis: configService.get<number>(
              'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
              5000,
            ),
          },
          maxQueryExecutionTime: slowQueryThresholdMs,
          logger: new TypeOrmSlowQueryLogger(
            appLogger.child({ module: 'TypeORM' }),
            slowQueryThresholdMs,
          ),
          logging: isDevelopment
            ? (['query', 'error', 'warn', 'schema'] as const)
            : (['error', 'warn'] as const),
        };
      },
    }),
  ],
  providers: [DatabaseLoggerService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
