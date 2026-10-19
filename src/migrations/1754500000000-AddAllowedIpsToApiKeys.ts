import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAllowedIpsToApiKeys1754500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'api_keys',
      new TableColumn({
        name: 'allowedIps',
        type: 'text',
        isArray: true,
        default: "'{}'",
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('api_keys', 'allowedIps');
  }
}
