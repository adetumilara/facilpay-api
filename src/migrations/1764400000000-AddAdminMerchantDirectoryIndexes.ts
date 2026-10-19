import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminMerchantDirectoryIndexes1764400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_users_createdAt_id" ON "users" ("createdAt" DESC, "id") WHERE "deletedAt" IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_users_email_trgm" ON "users" USING GIN ("email" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_merchant_onboardings_status_merchantId" ON "merchant_onboardings" ("status", "merchantId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_merchant_onboardings_businessName_trgm" ON "merchant_onboardings" USING GIN ("businessName" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_refunds_paymentId_createdAt" ON "refunds" ("paymentId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_disputes_paymentId_createdAt" ON "disputes" ("paymentId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_sessions_userId_lastActiveAt" ON "sessions" ("userId", "lastActiveAt" DESC) WHERE "revoked" = false',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_sessions_userId_lastActiveAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_disputes_paymentId_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_refunds_paymentId_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_merchant_onboardings_businessName_trgm"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_merchant_onboardings_status_merchantId"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_email_trgm"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_createdAt_id"');
  }
}
