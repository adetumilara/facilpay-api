import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSettlementsTable1751000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "settlement_schedule_enum" AS ENUM ('daily', 'weekly', 'monthly')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'merchant_settlement_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'schedule', type: 'settlement_schedule_enum', default: "'monthly'" },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false },
          { name: 'lastSettledAt', type: 'timestamp', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'merchant_settlement_configs',
      new TableIndex({ name: 'UQ_merchant_settlement_config_userId', columnNames: ['userId'], isUnique: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'settlements',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'merchantId', type: 'uuid', isNullable: false },
          { name: 'schedule', type: 'settlement_schedule_enum', isNullable: false },
          { name: 'totalAmount', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false },
          { name: 'paymentIds', type: 'jsonb', default: "'[]'" },
          { name: 'processedAt', type: 'timestamp', isNullable: false },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'settlements',
      new TableIndex({ name: 'IDX_settlements_merchantId', columnNames: ['merchantId'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('settlements');
    await queryRunner.dropTable('merchant_settlement_configs');
    await queryRunner.query(`DROP TYPE "settlement_schedule_enum"`);
  }
}
