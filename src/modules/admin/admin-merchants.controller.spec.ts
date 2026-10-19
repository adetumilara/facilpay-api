import { AdminMerchantsController } from './admin-merchants.controller';

describe('AdminMerchantsController', () => {
  const admin = { id: 'admin-id' } as any;
  let controller: AdminMerchantsController;
  let authService: any;
  let usersService: any;
  let auditLogsService: any;
  let mailService: any;

  beforeEach(() => {
    authService = { validateStepUpToken: jest.fn() };
    usersService = {
      setMerchantStatus: jest.fn().mockResolvedValue({
        id: 'merchant-id',
        email: 'merchant@example.com',
        status: 'SUSPENDED',
        suspendedReason: 'fraud review',
      }),
    };
    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };
    mailService = { sendMerchantStatusEmail: jest.fn().mockResolvedValue(undefined) };
    controller = new AdminMerchantsController(
      authService,
      usersService,
      auditLogsService,
      mailService,
    );
  });

  it('requires step-up, records the suspension, and notifies the merchant', async () => {
    const request = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } } as any;

    await controller.suspend(
      'merchant-id',
      { reason: ' fraud review ' },
      admin,
      'step-up-token',
      request,
    );

    expect(authService.validateStepUpToken).toHaveBeenCalledWith(
      'step-up-token',
      'admin-id',
    );
    expect(usersService.setMerchantStatus).toHaveBeenCalledWith(
      'merchant-id',
      'SUSPENDED',
      'fraud review',
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'merchant.suspended', resourceId: 'merchant-id' }),
    );
    expect(mailService.sendMerchantStatusEmail).toHaveBeenCalledWith(
      'merchant@example.com',
      'SUSPENDED',
      'fraud review',
    );
  });

  it('requires step-up, records reinstatement, and notifies the merchant', async () => {
    usersService.setMerchantStatus.mockResolvedValue({
      id: 'merchant-id',
      email: 'merchant@example.com',
      status: 'ACTIVE',
      suspendedReason: null,
    });

    await controller.reinstate(
      'merchant-id',
      admin,
      'step-up-token',
      { ip: '127.0.0.1', headers: { 'user-agent': 'test' } } as any,
    );

    expect(authService.validateStepUpToken).toHaveBeenCalledWith(
      'step-up-token',
      'admin-id',
    );
    expect(usersService.setMerchantStatus).toHaveBeenCalledWith(
      'merchant-id',
      'ACTIVE',
      null,
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'merchant.reinstated', resourceId: 'merchant-id' }),
    );
    expect(mailService.sendMerchantStatusEmail).toHaveBeenCalledWith(
      'merchant@example.com',
      'ACTIVE',
      undefined,
    );
  });
});
