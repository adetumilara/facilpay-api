import { Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Dispute } from '../payments/dispute.entity';
import { Payment } from '../payments/payment.entity';
import { Refund } from '../payments/refund.entity';
import { MerchantOnboarding } from '../onboarding/merchant-onboarding.entity';
import { Session } from '../auth/entities/session.entity';
import { User } from '../users/user.entity';
import { ListAdminMerchantsDto } from './dto/list-admin-merchants.dto';
import { AdminMerchantsService } from './admin-merchants.service';

interface MockQueryBuilder {
  [method: string]: jest.Mock;
  getRawMany: jest.Mock;
  getCount: jest.Mock;
}

function createQueryBuilder(
  rawRows: unknown[] = [],
  count = 0,
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: jest.fn(),
    addSelect: jest.fn(),
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    addGroupBy: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
    getCount: jest.fn().mockResolvedValue(count),
  };
  for (const method of [
    'select',
    'addSelect',
    'leftJoin',
    'innerJoin',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'skip',
    'take',
  ]) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

describe('AdminMerchantsService', () => {
  let service: AdminMerchantsService;
  let userRepository: Partial<Repository<User>>;
  let onboardingRepository: Partial<Repository<MerchantOnboarding>>;
  let paymentRepository: Partial<Repository<Payment>>;
  let refundRepository: Partial<Repository<Refund>>;
  let disputeRepository: Partial<Repository<Dispute>>;
  let sessionRepository: Partial<Repository<Session>>;
  let auditLogsService: Partial<AuditLogsService>;
  let listQuery: ReturnType<typeof createQueryBuilder>;

  beforeEach(() => {
    listQuery = createQueryBuilder(
      [
        {
          id: 'merchant-1',
          email: 'owner@example.com',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          businessName: 'Example Shop',
          onboardingStatus: 'approved',
        },
      ],
      1,
    );
    userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(listQuery),
    };
    onboardingRepository = {};
    paymentRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(
        createQueryBuilder([
          {
            merchantId: 'merchant-1',
            currency: 'USD',
            volume: '300.00',
            transactionCount: '2',
          },
        ]),
      ),
    };
    refundRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(
          createQueryBuilder([{ merchantId: 'merchant-1', count: '1' }]),
        ),
    };
    disputeRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(
          createQueryBuilder([{ merchantId: 'merchant-1', count: '2' }]),
        ),
    };
    sessionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(
        createQueryBuilder([
          {
            merchantId: 'merchant-1',
            lastActivityAt: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
      ),
    };
    auditLogsService = { record: jest.fn() };
    service = new AdminMerchantsService(
      userRepository as Repository<User>,
      onboardingRepository as Repository<MerchantOnboarding>,
      paymentRepository as Repository<Payment>,
      refundRepository as Repository<Refund>,
      disputeRepository as Repository<Dispute>,
      sessionRepository as Repository<Session>,
      auditLogsService as AuditLogsService,
    );
  });

  it('filters by search, account status, and onboarding status', async () => {
    const query: ListAdminMerchantsDto = {
      search: '  example  ',
      status: 'active',
      onboardingStatus: 'approved' as ListAdminMerchantsDto['onboardingStatus'],
      page: 2,
      limit: 10,
    };

    const result = await service.list(query);

    expect(listQuery.andWhere).toHaveBeenCalledWith(
      '(merchant.email ILIKE :search OR onboarding.businessName ILIKE :search)',
      { search: '%example%' },
    );
    expect(listQuery.andWhere).toHaveBeenCalledWith(
      'merchant.isActive = :isActive',
      { isActive: true },
    );
    expect(listQuery.andWhere).toHaveBeenCalledWith(
      '(onboarding.status = :onboardingStatus OR (onboarding.merchantId IS NULL AND :onboardingStatus = :pendingStatus))',
      { onboardingStatus: 'approved', pendingStatus: 'pending' },
    );
    expect(listQuery.skip).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 1, page: 2, limit: 10 });
    expect(result.data[0]).toMatchObject({
      businessName: 'Example Shop',
      volume30d: { USD: '300.00' },
      refundRate30d: 50,
      disputeRate30d: 100,
    });
  });

  it('treats a merchant without an onboarding row as pending', async () => {
    listQuery.getRawMany.mockResolvedValue([
      {
        id: 'merchant-1',
        email: 'owner@example.com',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        businessName: null,
        onboardingStatus: null,
      },
    ]);

    const result = await service.list({ page: 1, limit: 25 });

    expect(result.data[0].onboardingStatus).toBe('pending');
  });
});
