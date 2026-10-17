import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchantBalanceLedger1755000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchantId" varchar(255) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "account" varchar(20) NOT NULL,
        "amount" decimal(20,8) NOT NULL,
        "referenceType" varchar(50) NOT NULL,
        "referenceId" varchar(255) NOT NULL,
        "transactionId" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ledger_entries_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "CHK_ledger_entries_account" CHECK ("account" IN ('AVAILABLE', 'PENDING', 'FEES', 'RESERVE', 'PAYOUT')),
        CONSTRAINT "CHK_ledger_entries_amount" CHECK ("amount" <> 0)
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "IDX_ledger_entries_merchant_created" ON "ledger_entries" ("merchantId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ledger_entries_transaction" ON "ledger_entries" ("transactionId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ledger_entries_merchant_account" ON "ledger_entries" ("merchantId", "currency", "account")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ledger_entries_reference" ON "ledger_entries" ("merchantId", "referenceType", "referenceId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_ledger_entries_reference_line" ON "ledger_entries" ("merchantId", "currency", "referenceType", "referenceId", "account", "transactionId")',
    );

    // Backfill historical completed payments. The net amount is the
    // merchant-available amount; the difference is the fee line.
    await queryRunner.query(`
      WITH historical_payments AS (
        SELECT
          p."id",
          p."merchantId",
          p."currency",
          p."amount"::numeric AS gross,
          CASE
            WHEN COALESCE(p."netAmount", 0) = 0
              AND COALESCE(p."feeAmount", 0) = 0
              THEN p."amount"
            ELSE COALESCE(p."netAmount", p."amount")
          END::numeric AS net,
          p."updatedAt" AS occurred_at
        FROM "payments" p
        WHERE p."merchantId" IS NOT NULL
          AND p."status" IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'PARTIALLY_COMPLETED')
      )
      INSERT INTO "ledger_entries" (
        "merchantId", "currency", "account", "amount",
        "referenceType", "referenceId", "transactionId", "createdAt"
      )
      SELECT
        hp."merchantId", hp."currency", 'PENDING', -hp."gross",
        'PAYMENT', hp."id"::text,
        md5('ledger-payment-completion:' || hp."id"::text)::uuid,
        hp."occurred_at"
      FROM historical_payments hp
      WHERE NOT EXISTS (
        SELECT 1 FROM "ledger_entries" le
        WHERE le."transactionId" = md5('ledger-payment-completion:' || hp."id"::text)::uuid
          AND le."account" = 'PENDING'
      )
      UNION ALL
      SELECT
        hp."merchantId", hp."currency", 'AVAILABLE', hp."net",
        'PAYMENT', hp."id"::text,
        md5('ledger-payment-completion:' || hp."id"::text)::uuid,
        hp."occurred_at"
      FROM historical_payments hp
      WHERE hp."net" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le
          WHERE le."transactionId" = md5('ledger-payment-completion:' || hp."id"::text)::uuid
            AND le."account" = 'AVAILABLE'
        )
      UNION ALL
      SELECT
        hp."merchantId", hp."currency", 'FEES', hp."gross" - hp."net",
        'FEE', hp."id"::text,
        md5('ledger-payment-completion:' || hp."id"::text)::uuid,
        hp."occurred_at"
      FROM historical_payments hp
      WHERE hp."gross" - hp."net" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le
          WHERE le."transactionId" = md5('ledger-payment-completion:' || hp."id"::text)::uuid
            AND le."account" = 'FEES'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "ledger_entries" (
        "merchantId", "currency", "account", "amount",
        "referenceType", "referenceId", "transactionId", "createdAt"
      )
      SELECT
        p."merchantId", p."currency", 'AVAILABLE', -r."amount"::numeric,
        'REFUND', r."id"::text,
        md5('ledger-refund:' || r."id"::text)::uuid,
        r."createdAt"
      FROM "refunds" r
      INNER JOIN "payments" p ON p."id" = r."paymentId"
      WHERE p."merchantId" IS NOT NULL
        AND r."amount" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le
          WHERE le."transactionId" = md5('ledger-refund:' || r."id"::text)::uuid
            AND le."account" = 'AVAILABLE'
        )
      UNION ALL
      SELECT
        p."merchantId", p."currency",
        CASE WHEN p."settlementId" IS NULL THEN 'PAYOUT' ELSE 'RESERVE' END,
        r."amount"::numeric,
        'REFUND', r."id"::text,
        md5('ledger-refund:' || r."id"::text)::uuid,
        r."createdAt"
      FROM "refunds" r
      INNER JOIN "payments" p ON p."id" = r."paymentId"
      WHERE p."merchantId" IS NOT NULL
        AND r."amount" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le
          WHERE le."transactionId" = md5('ledger-refund:' || r."id"::text)::uuid
            AND le."account" = CASE
              WHEN p."settlementId" IS NULL THEN 'PAYOUT'
              ELSE 'RESERVE'
            END
        )
    `);

    await queryRunner.query(`
      INSERT INTO "ledger_entries" (
        "merchantId", "currency", "account", "amount",
        "referenceType", "referenceId", "transactionId", "createdAt"
      )
      SELECT
        s."merchantId", s."currency", 'AVAILABLE', -s."totalAmount"::numeric,
        'SETTLEMENT', s."id"::text,
        md5('ledger-settlement:' || s."id"::text)::uuid,
        s."processedAt"
      FROM "settlements" s
      WHERE s."totalAmount" <> 0
        AND NOT EXISTS (
        SELECT 1 FROM "ledger_entries" le
        WHERE le."transactionId" = md5('ledger-settlement:' || s."id"::text)::uuid
          AND le."account" = 'AVAILABLE'
      )
      UNION ALL
      SELECT
        s."merchantId", s."currency", 'PAYOUT', s."totalAmount"::numeric,
        'SETTLEMENT', s."id"::text,
        md5('ledger-settlement:' || s."id"::text)::uuid,
        s."processedAt"
      FROM "settlements" s
      WHERE s."totalAmount" <> 0
        AND NOT EXISTS (
        SELECT 1 FROM "ledger_entries" le
        WHERE le."transactionId" = md5('ledger-settlement:' || s."id"::text)::uuid
          AND le."account" = 'PAYOUT'
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'ledger_entries is append-only';
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TR_ledger_entries_append_only"
      BEFORE UPDATE OR DELETE ON "ledger_entries"
      FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS "TR_ledger_entries_append_only" ON "ledger_entries"',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS prevent_ledger_entry_mutation()',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "ledger_entries"');
  }
}
