import { Repository } from 'typeorm';
import { LedgerService } from './ledger.service';
import { LedgerAccount, LedgerEntry } from './ledger-entry.entity';
import { GetLedgerEntriesDto } from './dto/get-ledger-entries.dto';

describe('LedgerService', () => {
  let service: LedgerService;
  let queryBuilder: Record<string, jest.Mock>;

  beforeEach(() => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new LedgerService(
      repository as unknown as Repository<LedgerEntry>,
    );
  });

  it('groups balances by currency and account', async () => {
    queryBuilder.getRawMany.mockResolvedValueOnce([
      {
        currency: 'USD',
        account: LedgerAccount.AVAILABLE,
        balance: '92.50000000',
      },
      { currency: 'USD', account: LedgerAccount.FEES, balance: '7.50000000' },
    ]);

    const result = await service.getBalance('merchant-1', 'usd');

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'entry.merchantId = :merchantId',
      { merchantId: 'merchant-1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'entry.currency = :currency',
      { currency: 'USD' },
    );
    expect(result).toEqual({
      merchantId: 'merchant-1',
      balances: [
        {
          currency: 'USD',
          account: LedgerAccount.AVAILABLE,
          balance: '92.50000000',
        },
        {
          currency: 'USD',
          account: LedgerAccount.FEES,
          balance: '7.50000000',
        },
      ],
    });
  });

  it('filters and paginates ledger entries for the merchant', async () => {
    const entries = [{ id: 'entry-1' }];
    queryBuilder.getManyAndCount.mockResolvedValueOnce([entries, 1]);
    const dto: GetLedgerEntriesDto = {
      page: 2,
      limit: 10,
      currency: 'EUR',
      account: LedgerAccount.AVAILABLE,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
    };

    const result = await service.findLedger('merchant-1', dto);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'entry.currency = :currency',
      { currency: 'EUR' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'entry.account = :account',
      { account: LedgerAccount.AVAILABLE },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({ data: entries, total: 1, page: 2, limit: 10 });
  });

  it('reports unbalanced transactions from the consistency query', async () => {
    queryBuilder.getRawMany.mockResolvedValueOnce([
      { transactionId: 'transaction-1', amount: '0.01' },
    ]);

    const report = await service.checkConsistency();

    expect(queryBuilder.having).toHaveBeenCalledWith('SUM(entry.amount) <> 0');
    expect(report.unbalancedTransactions).toEqual([
      { transactionId: 'transaction-1', amount: '0.01' },
    ]);
  });

  it('schedules the consistency check', async () => {
    const checkConsistency = jest
      .spyOn(service, 'checkConsistency')
      .mockResolvedValue({ checkedAt: new Date(), unbalancedTransactions: [] });

    await service.scheduledConsistencyCheck();

    expect(checkConsistency).toHaveBeenCalledTimes(1);
  });
});
