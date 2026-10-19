import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPaymentCancellation1706200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'payments',
      new TableColumn({
        name: 'cancelledAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    // Update the status enum to include CANCELLED
    // Note: For PostgreSQL, we need to alter the enum type
    await queryRunner.query(
      `ALTER TYPE "payments_status_enum" ADD VALUE 'CANCELLED' BEFORE 'REFUNDED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('payments', 'cancelledAt');
    // Note: PostgreSQL doesn't support removing enum values easily
    // Manual intervention may be required to remove the CANCELLED value
  }
}
