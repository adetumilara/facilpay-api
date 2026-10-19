import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateInAppNotificationsTable1765000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'in_app_notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'type', type: 'varchar', length: '50', isNullable: false },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          { name: 'body', type: 'text', isNullable: false },
          { name: 'link', type: 'varchar', length: '2048', isNullable: true },
          { name: 'readAt', type: 'timestamptz', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'in_app_notifications',
      new TableIndex({
        name: 'IDX_in_app_notifications_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'in_app_notifications',
      new TableIndex({
        name: 'IDX_in_app_notifications_userId_createdAt',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'in_app_notifications',
      new TableIndex({
        name: 'IDX_in_app_notifications_userId_readAt',
        columnNames: ['userId', 'readAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('in_app_notifications');
  }
}
