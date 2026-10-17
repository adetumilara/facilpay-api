import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateRefundsTable1706000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add refundedAmount column to payments table
    await queryRunner.query(`
      ALTER TABLE payments 
      ADD COLUMN "refundedAmount" DECIMAL(10,2) DEFAULT 0
    `);

    // Add PARTIALLY_REFUNDED status to enum
    await queryRunner.query(`
      ALTER TYPE payment_status_enum ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'
    `);

    // Create refunds table
    await queryRunner.createTable(
      new Table({
        name: 'refunds',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'paymentId',
            type: 'uuid',
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'reason',
            type: 'varchar',
            isNullable: true,
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

    // Add foreign key
    await queryRunner.createForeignKey(
      'refunds',
      new TableForeignKey({
        columnNames: ['paymentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'payments',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refunds');
    await queryRunner.query(`
      ALTER TABLE payments DROP COLUMN "refundedAmount"
    `);
  }
}
