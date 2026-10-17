import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisputeResponseDeadlines1764400000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'escalated'`);
    await queryRunner.query(`
      ALTER TABLE "disputes"
      ADD COLUMN "respondBy" timestamptz,
      ADD COLUMN "reminder3DaySentAt" timestamptz,
      ADD COLUMN "reminder1DaySentAt" timestamptz,
      ADD COLUMN "escalatedAt" timestamptz
    `);
    await queryRunner.query(`
      UPDATE "disputes" SET "respondBy" = "createdAt" + INTERVAL '7 days'
    `);
    await queryRunner.query(`ALTER TABLE "disputes" ALTER COLUMN "respondBy" SET NOT NULL`);
    await queryRunner.query(
      'CREATE INDEX "IDX_disputes_status_respondBy" ON "disputes" ("status", "respondBy")',
    );
    await queryRunner.query(
      "ALTER TYPE email_event_type ADD VALUE IF NOT EXISTS 'dispute_response_reminder'",
    );
    await queryRunner.query(
      "ALTER TYPE email_event_type ADD VALUE IF NOT EXISTS 'dispute_escalated'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_disputes_status_respondBy"');
    await queryRunner.query(`
      ALTER TABLE "disputes"
      DROP COLUMN "escalatedAt",
      DROP COLUMN "reminder1DaySentAt",
      DROP COLUMN "reminder3DaySentAt",
      DROP COLUMN "respondBy"
    `);
  }
}