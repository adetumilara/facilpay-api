import { TypeOrmSlowQueryLogger } from './typeorm-slow-query.logger';

describe('TypeOrmSlowQueryLogger', () => {
  it('logs slow queries exceeding the configured threshold', () => {
    const warn = jest.fn();
    const logger = new TypeOrmSlowQueryLogger(
      { warn } as unknown as import('pino').Logger,
      500,
    );

    logger.logQuerySlow(750, 'SELECT * FROM payments WHERE status = $1', [
      'PENDING',
    ]);

    expect(warn).toHaveBeenCalledWith(
      {
        durationMs: 750,
        thresholdMs: 500,
        query: 'SELECT * FROM payments WHERE status = $1',
        parameters: ['PENDING'],
      },
      'Slow database query detected',
    );
  });

  it('does not log fast queries through logQuerySlow', () => {
    const warn = jest.fn();
    const logger = new TypeOrmSlowQueryLogger(
      { warn } as unknown as import('pino').Logger,
      500,
    );

    logger.logQuery('SELECT 1');

    expect(warn).not.toHaveBeenCalled();
  });
});
