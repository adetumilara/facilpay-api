import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailDeliveryTracking1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE email_log_status ADD VALUE IF NOT EXISTS 'delivered'`);
    await queryRunner.query(`ALTER TYPE email_log_status ADD VALUE IF NOT EXISTS 'bounced'`);
    await queryRunner.query(`ALTER TYPE email_log_status ADD VALUE IF NOT EXISTS 'complained'`);
    await queryRunner.query(`ALTER TYPE email_log_status ADD VALUE IF NOT EXISTS 'suppressed'`);

    await queryRunner.query(`
      ALTER TABLE "email_logs"
      ADD COLUMN "providerMessageId" varchar(255),
      ADD COLUMN "statusUpdatedAt" timestamp
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_email_logs_providerMessageId" ON "email_logs" ("providerMessageId")`,
    );

    await queryRunner.query(
      `CREATE TYPE "email_suppression_reason" AS ENUM ('hard_bounce', 'complaint', 'manual')`,
    );
    await queryRunner.query(`
      CREATE TABLE "email_suppressions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "reason" "email_suppression_reason" NOT NULL,
        "provider" varchar(50),
        "details" text,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_email_suppressions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_email_suppressions_email" ON "email_suppressions" ("email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_suppressions"`);
    await queryRunner.query(`DROP TYPE "email_suppression_reason"`);
    await queryRunner.query(`DROP INDEX "IDX_email_logs_providerMessageId"`);
    await queryRunner.query(`
      ALTER TABLE "email_logs"
      DROP COLUMN "statusUpdatedAt",
      DROP COLUMN "providerMessageId"
    `);
    // Postgres cannot drop enum values; the extra email_log_status values are left in place.
  }
}
