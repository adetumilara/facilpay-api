import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchantLimits1764300000000 implements MigrationInterface {
    name = 'CreateMerchantLimits1764300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      CREATE TABLE "merchant_limits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchantId" uuid NOT NULL,
        "currency" varchar(3) NOT NULL,
        "maxSinglePayment" numeric(14,2),
        "dailyVolume" numeric(14,2),
        "monthlyVolume" numeric(14,2),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_merchant_limits_merchant_currency" UNIQUE ("merchantId", "currency")
      )
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "merchant_limits"');
    }
}