import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMerchantSuspension1764400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'status',
        type: 'varchar',
        length: '16',
        default: "'ACTIVE'",
      }),
      new TableColumn({
        name: 'suspendedReason',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'suspendedAt',
        type: 'timestamptz',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('users', [
      'suspendedAt',
      'suspendedReason',
      'status',
    ]);
  }
}
