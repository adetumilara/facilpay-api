import { DisputesService } from './disputes.service';
import { Dispute, DisputeStatus } from './dispute.entity';

describe('DisputesService response deadlines', () => {
  let service: DisputesService;
  let disputes: Dispute[];
  let repository: any;
  let sentReminders: Set<string>;
  let escalated: Set<string>;
  let notificationService: any;
  let webhookService: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    disputes = [
      {
        id: 'three-day',
        paymentId: 'payment-3',
        status: DisputeStatus.OPEN,
        merchantEmail: 'merchant@example.com',
        payerEmail: null,
        respondBy: new Date('2026-01-04T00:00:00.000Z'),
        reminder3DaySentAt: null,
        reminder1DaySentAt: null,
      },
      {
        id: 'one-day',
        paymentId: 'payment-1',
        status: DisputeStatus.UNDER_REVIEW,
        merchantEmail: 'merchant@example.com',
        payerEmail: null,
        respondBy: new Date('2026-01-02T00:00:00.000Z'),
        reminder3DaySentAt: new Date('2025-12-31T00:00:00.000Z'),
        reminder1DaySentAt: null,
      },
      {
        id: 'overdue',
        paymentId: 'payment-late',
        status: DisputeStatus.OPEN,
        merchantEmail: 'merchant@example.com',
        payerEmail: null,
        respondBy: new Date('2025-12-31T00:00:00.000Z'),
        reminder3DaySentAt: null,
        reminder1DaySentAt: null,
        escalatedAt: null,
      },
    ] as Dispute[];
    sentReminders = new Set();
    escalated = new Set();
    repository = {
      find: jest.fn().mockImplementation(async () => disputes),
      createQueryBuilder: jest.fn(() => {
        let updates: any;
        let disputeId: string;
        const builder: any = {
          update: jest.fn().mockReturnThis(),
          set: jest.fn((value) => { updates = value; return builder; }),
          where: jest.fn((_condition, params) => { disputeId = params.disputeId; return builder; }),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn(async () => {
            if (updates.status === DisputeStatus.ESCALATED) {
              if (escalated.has(disputeId)) return { affected: 0 };
              escalated.add(disputeId);
              return { affected: 1 };
            }
            const field = Object.keys(updates)[0];
            const key = `${disputeId}:${field}`;
            if (sentReminders.has(key)) return { affected: 0 };
            sentReminders.add(key);
            const dispute = disputes.find((item) => item.id === disputeId);
            if (dispute) (dispute as any)[field] = updates[field];
            return { affected: 1 };
          }),
        };
        return builder;
      }),
    };
    notificationService = {
      sendDisputeResponseReminder: jest.fn().mockResolvedValue(undefined),
      sendDisputeEscalatedNotice: jest.fn().mockResolvedValue(undefined),
      sendMerchantDisputeStatusChanged: jest.fn().mockResolvedValue(undefined),
      sendPayerDisputeStatusChanged: jest.fn().mockResolvedValue(undefined),
    };
    webhookService = { dispatchEventToMerchant: jest.fn().mockResolvedValue(undefined) };
    const paymentRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'payment-late',
        merchantId: 'merchant-id',
        amount: 10,
        currency: 'USD',
      }),
    };
    const logger = {
      child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
    };
    const config = {
      get: jest.fn((key, fallback) => key === 'DISPUTE_ADMIN_EMAILS' ? 'admin@example.com' : fallback),
    };

    service = new DisputesService(
      repository,
      paymentRepository as any,
      {} as any,
      logger as any,
      notificationService,
      webhookService,
      config as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('sends each deadline reminder once and escalates overdue disputes with an updated webhook', async () => {
    await service.processResponseDeadlines();
    await service.processResponseDeadlines();

    expect(notificationService.sendDisputeResponseReminder).toHaveBeenCalledTimes(2);
    expect(notificationService.sendDisputeResponseReminder).toHaveBeenNthCalledWith(
      1,
      'merchant@example.com',
      expect.objectContaining({ disputeId: 'three-day', daysRemaining: 3 }),
    );
    expect(notificationService.sendDisputeResponseReminder).toHaveBeenNthCalledWith(
      2,
      'merchant@example.com',
      expect.objectContaining({ disputeId: 'one-day', daysRemaining: 1 }),
    );
    expect(notificationService.sendDisputeEscalatedNotice).toHaveBeenCalledTimes(1);
    expect(notificationService.sendDisputeEscalatedNotice).toHaveBeenCalledWith(
      'admin@example.com',
      expect.objectContaining({ disputeId: 'overdue' }),
    );
    expect(webhookService.dispatchEventToMerchant).toHaveBeenCalledWith(
      'merchant-id',
      'dispute.updated',
      expect.objectContaining({ disputeId: 'overdue', status: DisputeStatus.ESCALATED }),
    );
  });
});