import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentAndUserIndexes1750700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_status" ON "payments" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_createdAt" ON "payments" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payments_externalReference" ON "payments" ("externalReference")`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'users'
            AND indexdef ILIKE '%(email)%'
        ) THEN
          CREATE INDEX "IDX_users_email" ON "users" ("email");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_createdAt"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payments_externalReference"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
  }
}
