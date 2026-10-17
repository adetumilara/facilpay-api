import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoices1764400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "number" integer NOT NULL,
        "merchantId" uuid NOT NULL,
        "customerEmail" character varying(320) NOT NULL,
        "customerName" character varying(255),
        "currency" character varying(3) NOT NULL,
        "subtotal" decimal(12,2) NOT NULL,
        "taxRate" decimal(5,2) NOT NULL DEFAULT 0,
        "taxAmount" decimal(12,2) NOT NULL,
        "total" decimal(12,2) NOT NULL,
        "dueDate" timestamptz NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'DRAFT',
        "paymentId" uuid,
        "publicToken" character varying(64) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invoices_merchant_number" UNIQUE ("merchantId", "number"),
        CONSTRAINT "UQ_invoices_publicToken" UNIQUE ("publicToken")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_merchant_status" ON "invoices" ("merchantId", "status")
    `);
    await queryRunner.query(`
      CREATE TABLE "invoice_line_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoiceId" uuid NOT NULL,
        "description" character varying(500) NOT NULL,
        "quantity" decimal(10,3) NOT NULL,
        "unitPrice" decimal(12,2) NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        CONSTRAINT "PK_invoice_line_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_line_items_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "invoices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN "invoiceId" uuid,
      ADD CONSTRAINT "FK_payments_invoice" FOREIGN KEY ("invoiceId")
        REFERENCES "invoices"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_payments_invoiceId" ON "payments" ("invoiceId")',
    );
    await queryRunner.query(
      "ALTER TYPE email_event_type ADD VALUE IF NOT EXISTS 'invoice_created'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_payments_invoiceId"');
    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "FK_payments_invoice",
      DROP COLUMN "invoiceId"
    `);
    await queryRunner.query('DROP TABLE "invoice_line_items"');
    await queryRunner.query('DROP INDEX "IDX_invoices_merchant_status"');
    await queryRunner.query('DROP TABLE "invoices"');
  }
}