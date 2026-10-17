import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoupons1764400000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchantId" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "type" character varying(8) NOT NULL,
        "value" decimal(12,2) NOT NULL,
        "currency" character varying(3),
        "maxRedemptions" integer,
        "redemptions" integer NOT NULL DEFAULT 0,
        "reservedRedemptions" integer NOT NULL DEFAULT 0,
        "expiresAt" timestamptz,
        "isActive" boolean NOT NULL DEFAULT true,
        "applicableLinkIds" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_coupons_merchant_code" UNIQUE ("merchantId", "code")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN "couponId" uuid,
      ADD COLUMN "discountAmount" decimal(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN "couponRedemptionReserved" boolean NOT NULL DEFAULT false,
      ADD CONSTRAINT "FK_payments_coupon" FOREIGN KEY ("couponId")
        REFERENCES "coupons"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "FK_payments_coupon",
      DROP COLUMN "couponRedemptionReserved",
      DROP COLUMN "discountAmount",
      DROP COLUMN "couponId"
    `);
    await queryRunner.query('DROP TABLE "coupons"');
  }
}