import { EntityManager } from 'typeorm';
import { LedgerAccount, LedgerReferenceType } from './ledger-entry.entity';
import {
  appendLedgerTransaction,
  UnbalancedLedgerTransactionError,
} from './ledger-transaction';

describe('appendLedgerTransaction', () => {
  function createManager() {
    const repository = { save: jest.fn().mockResolvedValue([]) };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repository),
      create: jest.fn(
        (_entity: unknown, data: Record<string, unknown>) => data,
      ),
    };
    return { manager: manager as unknown as EntityManager, repository };
  }

  it('writes balanced lines under one transaction id', async () => {
    const { manager, repository } = createManager();

    const entries = await appendLedgerTransaction(manager, {
      lines: [
        {
          merchantId: 'merchant-1',
          currency: 'usd',
          account: LedgerAccount.AVAILABLE,
          amount: '92.5',
          referenceType: LedgerReferenceType.PAYMENT,
          referenceId: 'payment-1',
        },
        {
          merchantId: 'merchant-1',
          currency: 'USD',
          account: LedgerAccount.FEES,
          amount: -92.5,
          referenceType: LedgerReferenceType.PAYMENT,
          referenceId: 'payment-1',
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      merchantId: 'merchant-1',
      currency: 'USD',
      amount: '92.5',
    });
    expect(typeof entries[0].transactionId).toBe('string');
    expect(entries[1]).toMatchObject({ amount: '-92.5' });
    expect(entries[0].transactionId).toBe(entries[1].transactionId);
    expect(repository.save).toHaveBeenCalledWith(entries);
  });

  it('rejects an unbalanced transaction before writing', async () => {
    const { manager, repository } = createManager();

    await expect(
      appendLedgerTransaction(manager, {
        lines: [
          {
            merchantId: 'merchant-1',
            currency: 'USD',
            account: LedgerAccount.AVAILABLE,
            amount: '10.00',
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: 'payment-1',
          },
          {
            merchantId: 'merchant-1',
            currency: 'USD',
            account: LedgerAccount.FEES,
            amount: '-9.99',
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: 'payment-1',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedLedgerTransactionError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects mixed merchants or currencies in one transaction', async () => {
    const { manager } = createManager();

    await expect(
      appendLedgerTransaction(manager, {
        lines: [
          {
            merchantId: 'merchant-1',
            currency: 'USD',
            account: LedgerAccount.AVAILABLE,
            amount: '10',
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: 'payment-1',
          },
          {
            merchantId: 'merchant-2',
            currency: 'USD',
            account: LedgerAccount.FEES,
            amount: '-10',
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: 'payment-1',
          },
        ],
      }),
    ).rejects.toThrow('same merchant and currency');
  });

  it('rejects zero-value lines', async () => {
    const { manager } = createManager();

    await expect(
      appendLedgerTransaction(manager, {
        lines: [
          {
            merchantId: 'merchant-1',
            currency: 'USD',
            account: LedgerAccount.AVAILABLE,
            amount: 0,
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: 'payment-1',
          },
          {
            merchantId: 'merchant-1',
            currency: 'USD',
            account: LedgerAccount.FEES,
            amount: 0,
            referenceType: LedgerReferenceType.PAYMENT,
            referenceId: 'payment-1',
          },
        ],
      }),
    ).rejects.toThrow('non-zero amount');
  });
});
