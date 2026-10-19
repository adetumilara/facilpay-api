import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayouts1764200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "payouts_status_enum" AS ENUM ('PENDING', 'SUBMITTED', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchantId" varchar NOT NULL,
        "destination" varchar(56) NOT NULL,
        "amount" numeric(20,7) NOT NULL,
        "currency" varchar(12) NOT NULL,
        "memo" varchar(28),
        "reference" varchar(100) NOT NULL,
        "status" "payouts_status_enum" NOT NULL DEFAULT 'PENDING',
        "transactionHash" varchar(64),
        "failureReason" text,
        "submittedAt" timestamp,
        "completedAt" timestamp,
        "failedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payouts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_merchant_createdAt" ON "payouts" ("merchantId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payouts_merchant_reference" ON "payouts" ("merchantId", "reference")`,
    );

    await queryRunner.query(`
      CREATE TABLE "merchant_payout_limits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchantId" varchar NOT NULL,
        "currency" varchar(12) NOT NULL,
        "dailyLimit" numeric(20,7) NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_payout_limits" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_merchant_payout_limits_merchant_currency" ON "merchant_payout_limits" ("merchantId", "currency")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "merchant_payout_limits"`);
    await queryRunner.query(`DROP TABLE "payouts"`);
    await queryRunner.query(`DROP TYPE "payouts_status_enum"`);
  }
}
