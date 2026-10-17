import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppLogger } from '../logger/logger.service';

interface RetentionConfig {
  tableName: string;
  daysConfig: string;
  dateColumn: string;
  minDays?: number; // Hard minimum, never purge below this
  batchSize: number;
}

@Injectable()
export class MaintenanceService {
  private readonly batchSize = 5000;
  private readonly retentionConfigs: RetentionConfig[] = [
    {
      tableName: 'api_key_usage',
      daysConfig: 'RETENTION_API_KEY_USAGE_DAYS',
      dateColumn: 'created_at',
      batchSize: 5000,
    },
    {
      tableName: 'webhook_deliveries',
      daysConfig: 'RETENTION_WEBHOOK_DELIVERIES_DAYS',
      dateColumn: 'created_at',
      batchSize: 5000,
    },
    {
      tableName: 'email_logs',
      daysConfig: 'RETENTION_EMAIL_LOGS_DAYS',
      dateColumn: 'created_at',
      batchSize: 5000,
    },
    {
      tableName: 'audit_logs',
      daysConfig: 'RETENTION_AUDIT_LOGS_DAYS',
      dateColumn: 'created_at',
      minDays: 365, // Hard minimum: never delete audit logs less than 365 days old
      batchSize: 5000,
    },
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly appLogger: AppLogger,
  ) {}

  /**
   * Purge old data from retention tables
   * Deletes in batches to avoid long locks
   */
  async purgeOldData(): Promise<void> {
    const logger = this.appLogger.child({ module: 'MaintenanceService', action: 'purgeOldData' });

    logger.info('Starting data retention job');

    const results = {
      started: new Date().toISOString(),
      tables: {} as Record<string, { rowsPurged: number; reason?: string }>,
    };

    for (const config of this.retentionConfigs) {
      const retentionDays = this.configService.get<number>(config.daysConfig);

      // Skip if not configured (0 = keep forever)
      if (retentionDays === undefined || retentionDays === null || retentionDays === 0) {
        results.tables[config.tableName] = { rowsPurged: 0, reason: 'Not configured' };
        continue;
      }

      const minDays = config.minDays || 0;
      if (retentionDays < minDays) {
        results.tables[config.tableName] = {
          rowsPurged: 0,
          reason: `Below minimum retention of ${minDays} days`,
        };
        logger.warn(
          { tableName: config.tableName, minDays, configuredDays: retentionDays },
          'Retention days below minimum',
        );
        continue;
      }

      try {
        const rowsPurged = await this.purgeTable(config, retentionDays, logger);
        results.tables[config.tableName] = { rowsPurged };
      } catch (error) {
        results.tables[config.tableName] = { rowsPurged: 0, reason: String(error) };
        logger.error(
          { err: error, tableName: config.tableName },
          'Failed to purge table',
        );
      }
    }

    logger.info(results, 'Data retention job completed');
  }

  private async purgeTable(
    config: RetentionConfig,
    retentionDays: number,
    logger: any,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let totalDeleted = 0;

    while (true) {
      const deleteQuery = `
        DELETE FROM "${config.tableName}"
        WHERE "${config.dateColumn}" < $1
        LIMIT $2
      `;

      const result = await this.dataSource.query(deleteQuery, [cutoffDate, config.batchSize]);

      const deleted = result.length || (Array.isArray(result) ? result.length : 0);
      if (deleted === 0) {
        break; // No more rows to delete
      }

      totalDeleted += deleted;
      logger.debug(
        {
          tableName: config.tableName,
          batchDeleted: deleted,
          totalDeleted,
        },
        'Batch deleted',
      );

      // Small delay between batches to reduce lock contention
      await this.delay(100);
    }

    logger.info(
      { tableName: config.tableName, retentionDays, totalDeleted },
      'Table purge completed',
    );

    return totalDeleted;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
