import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditLog } from '../audit-logs/audit-log.entity';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './payment.entity';

const merchantId = 'merchant-1';
const paymentId = 'payment-1';

function createHarness() {
  const payment = {
    id: paymentId,
    merchantId,
    amount: 100,
    currency: 'USD',
    status: PaymentStatus.PENDING,
    description: 'Original description',
    metadata: { orderId: 'order-1' },
    externalReference: 'ref-1',
    createdAt: new Date('2026-09-25T10:00:00.000Z'),
    updatedAt: new Date('2026-09-25T10:00:00.000Z'),
  } as unknown as Payment;

  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      findOneBy: jest.fn().mockResolvedValue(payment),
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
        id: 'audit-1',
        timestamp: new Date('2026-09-25T10:01:00.000Z'),
        ...data,
      })),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    },
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    getRepository: jest.fn(),
  };
  const paymentRepository = {
    findOneBy: jest.fn().mockResolvedValue(payment),
  };
  const refundRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const disputeRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const paymentSseService = {
    emit: jest.fn(),
  };
  const webhooksService = {
    dispatchEventToMerchant: jest.fn().mockResolvedValue(undefined),
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
    paymentRepository as never,
    refundRepository as never,
    {} as never,
    {} as never,
    disputeRepository as never,
    {} as never,
    dataSource as never,
    appLogger as never,
    paymentSseService as never,
    {} as never,
    webhooksService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    service,
    payment,
    queryRunner,
    dataSource,
    paymentRepository,
    paymentSseService,
    webhooksService,
  };
}

describe('PaymentsService.update', () => {
  it('updates only mutable fields and records before/after audit and webhook data', async () => {
    const harness = createHarness();

    const result = await harness.service.update(
      paymentId,
      {
        description: 'Updated description',
        metadata: { orderId: 'order-2', source: 'checkout' },
        externalReference: 'ref-2',
      },
      merchantId,
      '203.0.113.10',
      'jest',
    );

    expect(result).toMatchObject({
      id: paymentId,
      amount: 100,
      currency: 'USD',
      status: PaymentStatus.PENDING,
      merchantId,
      description: 'Updated description',
      metadata: { orderId: 'order-2', source: 'checkout' },
      externalReference: 'ref-2',
    });
    expect(harness.queryRunner.manager.findOneBy).toHaveBeenCalledWith(
      Payment,
      { id: paymentId, merchantId },
    );
    expect(harness.queryRunner.manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        actorId: merchantId,
        actorType: 'user',
        action: 'payment.updated',
        resourceType: 'payment',
        resourceId: paymentId,
        ipAddress: '203.0.113.10',
        userAgent: 'jest',
        metadata: {
          before: {
            description: 'Original description',
            metadata: { orderId: 'order-1' },
            externalReference: 'ref-1',
          },
          after: {
            description: 'Updated description',
            metadata: { orderId: 'order-2', source: 'checkout' },
            externalReference: 'ref-2',
          },
          changedFields: ['description', 'metadata', 'externalReference'],
        },
      }),
    );
    expect(
      harness.webhooksService.dispatchEventToMerchant,
    ).toHaveBeenCalledWith(
      merchantId,
      'payment.updated',
      expect.objectContaining({
        paymentId,
        changedFields: ['description', 'metadata', 'externalReference'],
      }),
    );
    expect(harness.paymentSseService.emit).toHaveBeenCalledWith(result);
    expect(harness.queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it.each([
    ['amount', 200],
    ['currency', 'EUR'],
    ['status', PaymentStatus.COMPLETED],
    ['merchant', 'merchant-2'],
    ['merchantId', 'merchant-2'],
  ])('rejects attempts to update immutable field %s', async (field, value) => {
    const harness = createHarness();

    await expect(
      harness.service.update(
        paymentId,
        { description: 'Valid change', [field]: value },
        merchantId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(harness.dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('does not expose a payment owned by another merchant', async () => {
    const harness = createHarness();
    harness.queryRunner.manager.findOneBy.mockResolvedValueOnce(null);

    await expect(
      harness.service.update(
        paymentId,
        { description: 'Attempted change' },
        'merchant-2',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(harness.queryRunner.manager.save).not.toHaveBeenCalled();
    expect(
      harness.webhooksService.dispatchEventToMerchant,
    ).not.toHaveBeenCalled();
  });

  it('requires at least one mutable field', async () => {
    const harness = createHarness();

    await expect(
      harness.service.update(paymentId, {}, merchantId),
    ).rejects.toThrow(
      'At least one of description, metadata, or externalReference must be provided',
    );
  });

  it('does not emit an audit event or webhook when values are unchanged', async () => {
    const harness = createHarness();

    await harness.service.update(
      paymentId,
      { description: 'Original description' },
      merchantId,
    );

    expect(harness.queryRunner.manager.save).not.toHaveBeenCalled();
    expect(
      harness.webhooksService.dispatchEventToMerchant,
    ).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.getTimeline payment.updated projection', () => {
  it('includes persisted payment.updated audit events with before/after values', async () => {
    const harness = createHarness();
    const timestamp = new Date('2026-09-25T10:01:00.000Z');
    const auditLog = {
      timestamp,
      metadata: {
        before: { description: 'Before' },
        after: { description: 'After' },
        changedFields: ['description'],
      },
    } as unknown as AuditLog;
    const auditRepository = {
      find: jest.fn().mockResolvedValue([auditLog]),
    };
    harness.dataSource.getRepository.mockReturnValue(auditRepository);

    const timeline = await harness.service.getTimeline(paymentId);

    expect(auditRepository.find).toHaveBeenCalledWith({
      where: {
        action: 'payment.updated',
        resourceType: 'payment',
        resourceId: paymentId,
      },
      order: { timestamp: 'ASC' },
    });
    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'payment.updated',
          timestamp,
          data: {
            before: { description: 'Before' },
            after: { description: 'After' },
            changedFields: ['description'],
          },
        }),
      ]),
    );
    expect(timeline).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'payment.status_updated' }),
      ]),
    );
  });
});
