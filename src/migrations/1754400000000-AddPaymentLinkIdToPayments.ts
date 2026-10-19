import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPaymentLinkIdToPayments1754400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'payments',
      new TableColumn({
        name: 'paymentLinkId',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('payments', 'paymentLinkId');
  }
}
