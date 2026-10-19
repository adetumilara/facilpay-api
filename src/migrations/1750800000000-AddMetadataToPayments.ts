import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMetadataToPayments1750800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'payments',
      new TableColumn({
        name: 'metadata',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('payments', 'metadata');
  }
}
