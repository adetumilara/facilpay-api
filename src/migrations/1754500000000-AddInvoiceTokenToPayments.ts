import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceTokenToPayments1754500000000
  implements MigrationInterface
{
  name = 'AddInvoiceTokenToPayments1754500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoiceToken" character varying UNIQUE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payments_invoiceToken" ON "payments" ("invoiceToken") WHERE "invoiceToken" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payments_invoiceToken"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN IF EXISTS "invoiceToken"`,
    );
  }
}
