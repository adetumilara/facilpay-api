import { ForbiddenException } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

describe('ApiKeyAuthGuard merchant suspension', () => {
  it('rejects API key use for a suspended merchant', async () => {
    const apiKeysService = {
      validateKey: jest.fn().mockResolvedValue({ id: 'key-id', userId: 'merchant-id' }),
    };
    const reflector = { get: jest.fn().mockReturnValue(undefined) };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const usersService = {
      assertMerchantActive: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Merchant is suspended')),
    };
    const guard = new ApiKeyAuthGuard(
      apiKeysService as any,
      reflector as any,
      configService as any,
      usersService as any,
    );
    const request = {
      headers: { 'x-api-key': 'plaintext-key' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(usersService.assertMerchantActive).toHaveBeenCalledWith('merchant-id');
  });
});
