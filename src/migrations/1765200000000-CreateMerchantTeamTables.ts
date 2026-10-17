import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateMerchantTeamTables1765200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'merchant_members',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'merchantId', type: 'uuid', isNullable: false },
          { name: 'userId', type: 'uuid', isNullable: false },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          { name: 'invitedBy', type: 'uuid', isNullable: false },
          {
            name: 'joinedAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
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
            name: 'UQ_merchant_members_merchantId_userId',
            columnNames: ['merchantId', 'userId'],
          }),
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'merchant_members',
      new TableIndex({
        name: 'IDX_merchant_members_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_members',
      new TableIndex({
        name: 'IDX_merchant_members_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'merchant_invitations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'merchantId', type: 'uuid', isNullable: false },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'tokenHash',
            type: 'varchar',
            length: '128',
            isNullable: false,
          },
          { name: 'invitedBy', type: 'uuid', isNullable: false },
          { name: 'expiresAt', type: 'timestamptz', isNullable: false },
          { name: 'acceptedAt', type: 'timestamptz', isNullable: true },
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
      'merchant_invitations',
      new TableIndex({
        name: 'IDX_merchant_invitations_tokenHash',
        columnNames: ['tokenHash'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_invitations',
      new TableIndex({
        name: 'IDX_merchant_invitations_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_invitations',
      new TableIndex({
        name: 'IDX_merchant_invitations_email',
        columnNames: ['email'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('merchant_invitations');
    await queryRunner.dropTable('merchant_members');
  }
}
