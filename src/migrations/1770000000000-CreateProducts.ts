import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProducts1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "merchantId" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "description" text,
        "unitAmount" decimal(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_merchantId_users" FOREIGN KEY ("merchantId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_merchantId" ON "products" ("merchantId")
    `);

    await queryRunner.query(`
      ALTER TABLE "invoice_line_items"
      ADD COLUMN "productId" uuid,
      ADD CONSTRAINT "FK_invoice_line_items_productId_products" FOREIGN KEY ("productId")
        REFERENCES "products"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_line_items"
      DROP CONSTRAINT "FK_invoice_line_items_productId_products",
      DROP COLUMN "productId"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_products_merchantId"
    `);

    await queryRunner.query(`
      DROP TABLE "products"
    `);
  }
}
