import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddCompositeUniqueIndexToMerchantSettlementConfigs1754500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'merchant_settlement_configs',
      'UQ_merchant_settlement_config_userId',
    );

    await queryRunner.createIndex(
      'merchant_settlement_configs',
      new TableIndex({
        name: 'UQ_merchant_settlement_config_userId_currency',
        columnNames: ['userId', 'currency'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'merchant_settlement_configs',
      'UQ_merchant_settlement_config_userId_currency',
    );

    await queryRunner.createIndex(
      'merchant_settlement_configs',
      new TableIndex({
        name: 'UQ_merchant_settlement_config_userId',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );
  }
}
