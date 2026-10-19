import { StellarService, parseLowBalanceThresholds } from './stellar.service';

describe('StellarService fee and balance controls', () => {
  const createService = (
    configValues: Record<string, string> = {},
    balances: any[] = [],
  ): StellarService => {
    const service = Object.create(StellarService.prototype) as any;
    service.configService = {
      get: jest.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
    };
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service.feeStatsCache = null;
    service.lastLowBalanceAlerts = new Map();
    service.lowBalanceHealth = {
      status: 'unknown',
      message: 'not checked',
      lowAssets: [],
      checkedAt: null,
    };
    service.sourceKeypair = { publicKey: () => 'G_PLATFORM_ACCOUNT' };
    service.mailService = { sendLowStellarBalanceAlert: jest.fn().mockResolvedValue(undefined) };
    service.horizonClientService = {
      getHealthyServer: jest.fn(() => ({
        loadAccount: jest.fn().mockResolvedValue({ balances }),
      })),
    };
    return service;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses asset thresholds and ignores malformed entries', () => {
    expect(parseLowBalanceThresholds('XLM:100, usdc:1000,broken,nope:NaN,EUR:-1'))
      .toEqual([
        { assetCode: 'XLM', threshold: 100 },
        { assetCode: 'USDC', threshold: 1000 },
      ]);
  });

  it('uses configured Horizon percentile, clamps it, and caches fee_stats for 30 seconds', async () => {
    const service = createService({
      STELLAR_BASE_FEE: '100',
      STELLAR_MAX_FEE: '500',
      STELLAR_FEE_PERCENTILE: 'p70',
      STELLAR_HORIZON_URL: 'https://horizon.example/',
    }) as any;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fee_charged: { p70: '800' } }),
    }) as any;

    await expect(service.getRecommendedFee()).resolves.toBe(500);
    await expect(service.getRecommendedFee()).resolves.toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('https://horizon.example/fee_stats');
  });

  it('falls back to the static fee when Horizon fee_stats is unavailable', async () => {
    const service = createService({ STELLAR_BASE_FEE: '125' }) as any;
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

    await expect(service.getRecommendedFee()).resolves.toBe(125);
  });

  it('checks the destination trustline against both asset code and issuer', async () => {
    const service = createService() as any;
    service.horizonClientService.getHealthyServer = jest.fn(() => ({
      loadAccount: jest.fn().mockResolvedValue({
        balances: [
          { asset_code: 'USDC', asset_issuer: 'G_ISSUER', balance: '10' },
          { asset_code: 'USDC', asset_issuer: 'G_OTHER_ISSUER', balance: '20' },
        ],
      }),
    }));

    await expect(service.destinationHasTrustline('G_DESTINATION', {
      code: 'USDC',
      issuer: 'G_ISSUER',
      isNative: () => false,
    })).resolves.toBe(true);
    await expect(service.destinationHasTrustline('G_DESTINATION', {
      code: 'USDC',
      issuer: 'G_MISSING_ISSUER',
      isNative: () => false,
    })).resolves.toBe(false);
  });

  it('alerts at most once per hour per asset and marks the distribution account degraded', async () => {
    const service = createService(
      {
        STELLAR_LOW_BALANCE_THRESHOLDS: 'XLM:100',
        STELLAR_OPS_EMAILS: '',
      },
      [{ asset_type: 'native', balance: '5' }],
    ) as any;

    await service.monitorDistributionBalances();
    await service.monitorDistributionBalances();

    expect(service.getLowBalanceHealth()).toMatchObject({
      status: 'degraded',
      lowAssets: ['XLM'],
    });
    expect(service.lastLowBalanceAlerts.size).toBe(1);
    expect(service.lastLowBalanceAlerts.has('XLM')).toBe(true);
  });
});
