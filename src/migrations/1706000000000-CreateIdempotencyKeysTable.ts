import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateIdempotencyKeysTable1706000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'idempotency_keys',
        columns: [
          {
            name: 'key',
            type: 'varchar',
            isPrimary: true,
          },
          {
            name: 'requestHash',
            type: 'text',
          },
          {
            name: 'response',
            type: 'jsonb',
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'idempotency_keys',
      new TableIndex({
        name: 'IDX_idempotency_keys_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('idempotency_keys');
  }
}
