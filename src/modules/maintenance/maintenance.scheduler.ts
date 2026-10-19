import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MaintenanceService } from './maintenance.service';
import { AppLogger } from '../logger/logger.service';

@Injectable()
export class MaintenanceScheduler {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly appLogger: AppLogger,
  ) {}

  /**
   * Run data retention job daily at 2:00 AM UTC
   */
  @Cron('0 2 * * *', {
    name: 'dataRetention',
    timeZone: 'UTC',
  })
  async handleDataRetention() {
    const logger = this.appLogger.child({
      module: 'MaintenanceScheduler',
      task: 'dataRetention',
    });

    try {
      logger.info('Starting scheduled data retention job');
      await this.maintenanceService.purgeOldData();
    } catch (error) {
      logger.error({ err: error }, 'Scheduled data retention job failed');
    }
  }
}
