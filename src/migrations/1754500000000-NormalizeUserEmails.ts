import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeUserEmails1754500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          email,
          LOWER(TRIM(email)) AS normalized,
          ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email)) ORDER BY id ASC) AS rn
        FROM users
      )
      UPDATE users u
      SET email = r.normalized
      FROM ranked r
      WHERE u.id = r.id
        AND r.rn = 1
        AND u.email <> r.normalized;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return Promise.resolve();
  }
}
