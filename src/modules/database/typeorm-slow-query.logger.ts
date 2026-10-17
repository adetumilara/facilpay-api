import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { Logger } from 'pino';

export class TypeOrmSlowQueryLogger implements TypeOrmLogger {
  constructor(
    private readonly logger: Logger,
    private readonly thresholdMs: number,
  ) {}

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    this.logger.warn(
      {
        durationMs: time,
        thresholdMs: this.thresholdMs,
        query,
        parameters,
      },
      'Slow database query detected',
    );
  }

  logQuery(): void {}

  logQueryError(): void {}

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(): void {}
}
