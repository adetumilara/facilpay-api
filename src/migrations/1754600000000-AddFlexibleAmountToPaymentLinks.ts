import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlexibleAmountToPaymentLinks1754600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_links" ALTER COLUMN "amount" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payment_links" ADD COLUMN IF NOT EXISTS "flexibleAmount" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "payment_links" ADD COLUMN IF NOT EXISTS "minAmount" numeric(10,2) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "minAmount"`);
    await queryRunner.query(`ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "flexibleAmount"`);
    await queryRunner.query(`UPDATE "payment_links" SET "amount" = 0 WHERE "amount" IS NULL`);
    await queryRunner.query(`ALTER TABLE "payment_links" ALTER COLUMN "amount" SET NOT NULL`);
  }
}
