import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoginSecurityAlerts1764400000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "loginAlertsEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "passwordResetRequired" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "deviceFingerprint" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "countryCode" varchar(2)`,
    );
    await queryRunner.query(`
      CREATE TABLE "login_alert_action_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "sessionId" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
        "tokenHash" varchar(64) NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_login_alert_action_tokens_expiresAt" ON "login_alert_action_tokens" ("expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "login_alert_action_tokens"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "countryCode"`);
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN "deviceFingerprint"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "passwordResetRequired"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "loginAlertsEnabled"`,
    );
  }
}
