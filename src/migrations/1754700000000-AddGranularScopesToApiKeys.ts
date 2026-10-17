import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGranularScopesToApiKeys1754700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new scopes column as text array
    const scopesColumn = new TableColumn({
      name: 'scopes',
      type: 'text',
      isArray: true,
      default: `'{}'::text[]`,
      isNullable: false,
    });

    await queryRunner.addColumn('api_keys', scopesColumn);

    // Make scope column nullable for backward compatibility
    await queryRunner.changeColumn(
      'api_keys',
      'scope',
      new TableColumn({
        name: 'scope',
        type: 'enum',
        enum: ['read', 'write', 'admin'],
        isNullable: true,
        default: "'read'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove scopes column
    await queryRunner.dropColumn('api_keys', 'scopes');

    // Revert scope to NOT NULL with default
    await queryRunner.changeColumn(
      'api_keys',
      'scope',
      new TableColumn({
        name: 'scope',
        type: 'enum',
        enum: ['read', 'write', 'admin'],
        isNullable: false,
        default: "'read'",
      }),
    );
  }
}
