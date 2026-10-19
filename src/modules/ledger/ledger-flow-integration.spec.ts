import { Payment, PaymentStatus } from '../payments/payment.entity';
import { Refund } from '../payments/refund.entity';
import { PaymentsService } from '../payments/payments.service';
import { SettlementsService } from '../settlements/settlements.service';
import { Settlement } from '../settlements/entities/settlement.entity';
import {
  MerchantSettlementConfig,
  SettlementSchedule,
} from '../settlements/entities/merchant-settlement-config.entity';
import { LedgerAccount, LedgerEntry } from './ledger-entry.entity';

function savedEntries(repository: { save: jest.Mock }): LedgerEntry[] {
  return (repository.save.mock.calls as unknown[][])[0][0] as LedgerEntry[];
}

function createLedgerRepository(): { save: jest.Mock } {
  return { save: jest.fn().mockResolvedValue([]) };
}

function createPaymentService(
  payment: Payment,
  ledgerRepository: { save: jest.Mock },
) {
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      findOneBy: jest.fn().mockResolvedValue(payment),
      create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
        if (entity === Refund) return { id: 'refund-1', ...data };
        return { id: 'ledger-entry', ...data };
      }),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      count: jest.fn().mockResolvedValue(0),
      getRepository: jest.fn().mockReturnValue(ledgerRepository),
    },
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
  };
  const paymentSplitRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const paymentSseService = { emit: jest.fn() };
  const emailNotificationService = {
    sendMerchantPaymentReceived: jest.fn().mockResolvedValue(undefined),
    sendPayerPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
    sendMerchantRefundIssued: jest.fn().mockResolvedValue(undefined),
    sendPayerRefundProcessed: jest.fn().mockResolvedValue(undefined),
  };
  const appLogger = {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  };
  const service = new PaymentsService(
    {} as never,
    {} as never,
    {} as never,
    paymentSplitRepository as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
    {} as never,
    dataSource as never,
    appLogger as never,
    paymentSseService as never,
    emailNotificationService as never,
    { dispatchEventToMerchant: jest.fn() } as never,
    {
      get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
    } as never,
    { sendPayment: jest.fn() } as never,
    { findOne: jest.fn() } as never,
    {} as never,
  );

  return { service, queryRunner };
}

function completedPayment(): Payment {
  return {
    id: 'payment-1',
    merchantId: 'merchant-1',
    amount: 100,
    currency: 'USD',
    netAmount: 95,
    feeAmount: 5,
    status: PaymentStatus.PENDING,
    refundedAmount: 0,
    settlementId: null,
    paymentLinkId: null,
    merchantEmail: null,
    payerEmail: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Payment;
}

describe('ledger flow integration', () => {
  it('records balanced payment completion lines including the fee', async () => {
    const ledgerRepository = createLedgerRepository();
    const payment = completedPayment();
    const { service, queryRunner } = createPaymentService(
      payment,
      ledgerRepository,
    );

    await service.handleWebhook({
      paymentId: payment.id,
      status: PaymentStatus.COMPLETED,
    });

    const entries = savedEntries(ledgerRepository);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: LedgerAccount.PENDING,
          amount: '-100',
        }),
        expect.objectContaining({
          account: LedgerAccount.AVAILABLE,
          amount: '95',
        }),
        expect.objectContaining({ account: LedgerAccount.FEES, amount: '5' }),
      ]),
    );
    expect(
      entries.reduce(
        (sum: number, entry: { amount: string }) => sum + Number(entry.amount),
        0,
      ),
    ).toBe(0);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('records balanced refund lines in the refund transaction', async () => {
    const ledgerRepository = createLedgerRepository();
    const payment = {
      ...completedPayment(),
      status: PaymentStatus.COMPLETED,
    } as Payment;
    const { service } = createPaymentService(payment, ledgerRepository);

    await service.refund(
      payment.id,
      { amount: 25, reason: 'customer request' },
      'user-1',
    );

    const entries = savedEntries(ledgerRepository);
    expect(entries).toEqual([
      expect.objectContaining({
        account: LedgerAccount.AVAILABLE,
        amount: '-25',
      }),
      expect.objectContaining({ account: LedgerAccount.PAYOUT, amount: '25' }),
    ]);
    expect(entries[0].transactionId).toBe(entries[1].transactionId);
  });

  it('records balanced settlement lines in the settlement transaction', async () => {
    const ledgerRepository = createLedgerRepository();
    const config = {
      id: 'config-1',
      userId: 'merchant-1',
      currency: 'USD',
      schedule: SettlementSchedule.DAILY,
      lastSettledAt: null,
    } as MerchantSettlementConfig;
    const payment = {
      ...completedPayment(),
      status: PaymentStatus.COMPLETED,
    } as Payment;
    const configQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(config),
    };
    const paymentQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([payment]),
    };
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(configQuery)
          .mockReturnValueOnce(paymentQuery),
        create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
          if (entity === Settlement) return { id: 'settlement-1', ...data };
          return { id: 'ledger-entry', ...data };
        }),
        save: jest.fn((entity: unknown) => Promise.resolve(entity)),
        update: jest.fn().mockResolvedValue(undefined),
        getRepository: jest.fn().mockReturnValue(ledgerRepository),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const settlementService = new SettlementsService(
      {} as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([config]) } as never,
      {} as never,
      dataSource as never,
      { sendSettlementNotification: jest.fn() } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {
        get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
      } as never,
    );

    await settlementService.triggerManualRun('merchant-1');

    const entries = savedEntries(ledgerRepository);
    expect(entries).toEqual([
      expect.objectContaining({
        account: LedgerAccount.AVAILABLE,
        amount: '-95',
      }),
      expect.objectContaining({ account: LedgerAccount.PAYOUT, amount: '95' }),
    ]);
    expect(entries[0].transactionId).toBe(entries[1].transactionId);
  });
});
