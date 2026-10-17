import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddClaimableBalanceTracking1764500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "payment_splits_status_enum" ADD VALUE IF NOT EXISTS 'CLAIMABLE'`,
    );
    await queryRunner.addColumn(
      'payment_splits',
      new TableColumn({
        name: 'claimableBalanceId',
        type: 'varchar',
        isNullable: true,
      }),
    );
    await queryRunner.addColumns('refunds', [
      new TableColumn({
        name: 'status',
        type: 'varchar',
        length: '16',
        default: "'COMPLETED'",
      }),
      new TableColumn({
        name: 'stellarTransactionHash',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'claimableBalanceId',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('refunds', [
      'claimableBalanceId',
      'stellarTransactionHash',
      'status',
    ]);
    await queryRunner.dropColumn('payment_splits', 'claimableBalanceId');
  }
}
