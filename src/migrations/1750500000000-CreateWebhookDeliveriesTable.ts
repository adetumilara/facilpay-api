import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateWebhookDeliveriesTable1750500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS "callbackUrl" VARCHAR(2048)
    `);

    await queryRunner.query(`
      CREATE TYPE webhook_delivery_status_enum
      AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'DEAD')
    `);

    await queryRunner.createTable(
      new Table({
        name: 'webhook_deliveries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'paymentId', type: 'uuid' },
          { name: 'callbackUrl', type: 'varchar', length: '2048' },
          { name: 'payload', type: 'jsonb' },
          {
            name: 'status',
            type: 'enum',
            enumName: 'webhook_delivery_status_enum',
            default: "'PENDING'",
          },
          { name: 'attemptCount', type: 'int', default: '0' },
          { name: 'lastAttemptAt', type: 'timestamp', isNullable: true },
          { name: 'nextRetryAt', type: 'timestamp', isNullable: true },
          { name: 'lastStatusCode', type: 'int', isNullable: true },
          {
            name: 'lastError',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'webhook_deliveries',
      new TableForeignKey({
        columnNames: ['paymentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'payments',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_status_nextRetryAt',
        columnNames: ['status', 'nextRetryAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_deliveries');
    await queryRunner.query(`DROP TYPE IF EXISTS webhook_delivery_status_enum`);
    await queryRunner.query(
      `ALTER TABLE payments DROP COLUMN IF EXISTS "callbackUrl"`,
    );
  }
}
