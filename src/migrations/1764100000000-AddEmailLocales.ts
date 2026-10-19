import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailLocales1764100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "locale" varchar(10) NOT NULL DEFAULT 'en'`,
    );
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "payerLocale" varchar(10)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "payerLocale"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "locale"`);
  }
}
