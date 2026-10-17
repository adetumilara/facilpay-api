import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddApiVersionToWebhookEndpoints1765300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'webhook_endpoints',
      new TableColumn({
        name: 'apiVersion',
        type: 'varchar',
        length: '20',
        isNullable: false,
        default: "'2026-09-01'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('webhook_endpoints', 'apiVersion');
  }
}
