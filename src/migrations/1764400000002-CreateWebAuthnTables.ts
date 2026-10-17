import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebAuthnTables1764400000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webauthn_credentials" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "credentialId" varchar(255) NOT NULL,
        "publicKey" bytea NOT NULL,
        "counter" integer NOT NULL DEFAULT 0,
        "transports" text[] NOT NULL DEFAULT '{}',
        "name" varchar(100) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "lastUsedAt" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_webauthn_credentials_credentialId" ON "webauthn_credentials" ("credentialId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webauthn_credentials_userId" ON "webauthn_credentials" ("userId")`,
    );
    await queryRunner.query(`
      CREATE TABLE "webauthn_challenges" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "purpose" varchar(32) NOT NULL,
        "challenge" varchar(255) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_webauthn_challenges_userId_expiresAt" ON "webauthn_challenges" ("userId", "expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "webauthn_challenges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webauthn_credentials"`);
  }
}
