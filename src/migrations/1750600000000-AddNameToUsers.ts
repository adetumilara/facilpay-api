import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddNameToUsers1750600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'name',
        type: 'character varying',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'name');
  }
}
