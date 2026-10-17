import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreatePaymentLinksTable1750900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'payment_links',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'token', type: 'varchar', length: '32', isNullable: false },
          { name: 'amount', type: 'decimal', precision: 10, scale: 2, isNullable: false },
          { name: 'currency', type: 'varchar', length: '3', isNullable: false },
          { name: 'description', type: 'varchar', length: '500', isNullable: true },
          { name: 'expiresAt', type: 'timestamp', isNullable: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'views', type: 'int', default: 0 },
          { name: 'completions', type: 'int', default: 0 },
          { name: 'merchantId', type: 'uuid', isNullable: false },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'payment_links',
      new TableIndex({ name: 'UQ_payment_links_token', columnNames: ['token'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payment_links');
  }
}
