import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWebhookEndpointsTable1751100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'webhook_endpoints',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'merchantId',
            type: 'uuid',
          },
          {
            name: 'url',
            type: 'varchar',
            length: '2048',
          },
          {
            name: 'events',
            type: 'text',
            isArray: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'secret',
            type: 'varchar',
            length: '64',
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'webhook_endpoints',
      new TableIndex({
        name: 'idx_webhook_endpoints_merchant',
        columnNames: ['merchantId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_endpoints');
  }
}
