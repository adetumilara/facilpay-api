import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateNotificationPreferencesTable1765100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notification_preferences',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'userId', type: 'uuid', isNullable: false },
          {
            name: 'category',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          { name: 'email', type: 'boolean', default: true, isNullable: false },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_notification_preferences_userId_category',
            columnNames: ['userId', 'category'],
          }),
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'notification_preferences',
      new TableIndex({
        name: 'IDX_notification_preferences_userId',
        columnNames: ['userId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_preferences');
  }
}
