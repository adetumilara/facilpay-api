import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyExpiryWarnings1764400000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD COLUMN "lastExpiryWarningDays" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_api_keys_active_expiresAt" ON "api_keys" ("expiresAt") WHERE "isActive" = true AND "expiresAt" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TYPE "email_event_type" ADD VALUE IF NOT EXISTS 'api_key_expiring'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_api_keys_active_expiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP COLUMN "lastExpiryWarningDays"`,
    );
  }
}