import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class CreateCustomers1754800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'customers',
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
            name: 'email',
            type: 'varchar',
            length: '320',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_customers_merchantId_users',
            columnNames: ['merchantId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true,
    );

    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_customers_merchant_lower_email" ON "customers" ("merchantId", LOWER("email")) WHERE "deletedAt" IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_customers_merchantId" ON "customers" ("merchantId")',
    );

    await queryRunner.addColumn(
      'payments',
      new TableColumn({
        name: 'customerId',
        type: 'uuid',
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      'payments',
      new TableForeignKey({
        name: 'FK_payments_customerId_customers',
        columnNames: ['customerId'],
        referencedTableName: 'customers',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.addColumn(
      'recurring_payments',
      new TableColumn({
        name: 'customerId',
        type: 'uuid',
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      'recurring_payments',
      new TableForeignKey({
        name: 'FK_recurring_payments_customerId_customers',
        columnNames: ['customerId'],
        referencedTableName: 'customers',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'recurring_payments',
      'FK_recurring_payments_customerId_customers',
    );
    await queryRunner.dropColumn('recurring_payments', 'customerId');
    await queryRunner.dropForeignKey(
      'payments',
      'FK_payments_customerId_customers',
    );
    await queryRunner.dropColumn('payments', 'customerId');
    await queryRunner.dropTable('customers');
  }
}
