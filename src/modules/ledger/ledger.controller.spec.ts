import { LedgerController } from './ledger.controller';
import { LedgerAccount } from './ledger-entry.entity';
import { LedgerService } from './ledger.service';
import { User } from '../users/user.entity';
import { GetLedgerEntriesDto } from './dto/get-ledger-entries.dto';

describe('LedgerController', () => {
  it('scopes balance and ledger requests to the authenticated merchant', async () => {
    const service = {
      getBalance: jest.fn().mockResolvedValue({ balances: [] }),
      findLedger: jest.fn().mockResolvedValue({ data: [] }),
    };
    const controller = new LedgerController(
      service as unknown as LedgerService,
    );
    const user = { id: 'merchant-1' } as unknown as User;

    await controller.getBalance(user, 'usd');
    await controller.findLedger(user, {
      page: 1,
      limit: 20,
      account: LedgerAccount.AVAILABLE,
    } as GetLedgerEntriesDto);

    expect(service.getBalance).toHaveBeenCalledWith('merchant-1', 'usd');
    expect(service.findLedger).toHaveBeenCalledWith('merchant-1', {
      page: 1,
      limit: 20,
      account: LedgerAccount.AVAILABLE,
    });
  });
});
