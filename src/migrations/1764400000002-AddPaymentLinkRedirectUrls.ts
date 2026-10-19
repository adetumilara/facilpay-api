import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentLinkRedirectUrls1764400000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_links"
      ADD COLUMN IF NOT EXISTS "slug" character varying(64),
      ADD COLUMN IF NOT EXISTS "requiredFields" jsonb NOT NULL DEFAULT '{"name":false,"email":false,"phone":false}'::jsonb,
      ADD COLUMN IF NOT EXISTS "customFields" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "successUrl" character varying(2048),
      ADD COLUMN IF NOT EXISTS "cancelUrl" character varying(2048)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_links_slug" ON "payment_links" ("slug")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_payment_links_slug"');
    await queryRunner.query(`
      ALTER TABLE "payment_links"
      DROP COLUMN IF EXISTS "cancelUrl",
      DROP COLUMN IF EXISTS "successUrl",
      DROP COLUMN IF EXISTS "customFields",
      DROP COLUMN IF EXISTS "requiredFields",
      DROP COLUMN IF EXISTS "slug"
    `);
  }
}