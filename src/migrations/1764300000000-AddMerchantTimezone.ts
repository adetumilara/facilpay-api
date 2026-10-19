import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchantTimezone1764300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_settings" ADD COLUMN "timezone" varchar(64) NOT NULL DEFAULT 'UTC'`,
    );
    // Speeds up the merchant-scoped time-range scans behind /v1/analytics/payments.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_merchantId_createdAt" ON "payments" ("merchantId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_merchantId_createdAt"`);
    await queryRunner.query(`ALTER TABLE "merchant_settings" DROP COLUMN "timezone"`);
  }
}
