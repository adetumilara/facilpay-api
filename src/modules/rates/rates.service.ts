import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';
import { RatesRedisService } from './rates-redis.service';
import { FxRateProvider } from './fx-rate-provider.interface';
import { ExchangeRateHostProvider } from './providers/exchangerate-host.provider';
import { FixerIoProvider } from './providers/fixer-io.provider';

export interface RateResult {
  from: string;
  to: string;
  rate: number;
  source: 'cache' | 'provider' | 'fallback';
  provider?: string;
  isStale?: boolean;
}

const DEFAULT_TTL_SECONDS = 60;
const FALLBACK_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_RATE_AGE_SECONDS = 60 * 60; // 1 hour

@Injectable()
export class RatesService {
  private readonly logger: Logger;
  private readonly trackedPairs = new Set<string>();
  private readonly providers: FxRateProvider[];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redisService: RatesRedisService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: RatesService.name });
    this.providers = this.initializeProviders();
  }

  private initializeProviders(): FxRateProvider[] {
    const providerOrder = this.configService.get<string>('FX_PROVIDERS', 'exchangerate-host,fixer-io');
    const providers: FxRateProvider[] = [];

    for (const providerName of providerOrder.split(',')) {
      const name = providerName.trim();
      if (name === 'exchangerate-host') {
        providers.push(new ExchangeRateHostProvider(this.httpService));
      } else if (name === 'fixer-io') {
        providers.push(new FixerIoProvider(this.httpService, this.configService));
      }
    }

    if (providers.length === 0) {
      this.logger.warn('No FX providers configured, using default exchangerate-host');
      providers.push(new ExchangeRateHostProvider(this.httpService));
    }

    return providers;
  }

  async getRate(from: string, to: string): Promise<RateResult> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();
    const cacheKey = this.buildCacheKey(fromCode, toCode);

    this.trackedPairs.add(cacheKey);

    // Check cache first
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) {
      const cacheData = this.parseCacheData(cached);
      return {
        from: fromCode,
        to: toCode,
        rate: cacheData.rate,
        source: 'cache',
        provider: cacheData.provider,
        isStale: this.isRateStale(cacheData.fetchedAt),
      };
    }

    this.logger.warn({ from: fromCode, to: toCode }, 'FX rate cache miss');

    try {
      const { rate, provider } = await this.fetchRateWithProviders(fromCode, toCode);
      await this.cacheFxRate(fromCode, toCode, rate, provider);
      return { from: fromCode, to: toCode, rate, source: 'provider', provider };
    } catch (error) {
      const fallback = await this.redisService.get(this.buildFallbackKey(fromCode, toCode));
      if (fallback !== null) {
        const fallbackData = this.parseCacheData(fallback);
        this.logger.warn(
          { from: fromCode, to: toCode, provider: fallbackData.provider },
          'FX provider unavailable, serving previously cached fallback rate',
        );
        return {
          from: fromCode,
          to: toCode,
          rate: fallbackData.rate,
          source: 'fallback',
          provider: fallbackData.provider,
          isStale: this.isRateStale(fallbackData.fetchedAt),
        };
      }

      this.logger.error(
        { from: fromCode, to: toCode, error: error instanceof Error ? error.message : error },
        'FX providers unavailable and no fallback rate cached',
      );
      throw new ServiceUnavailableException(
        `Unable to retrieve exchange rate for ${fromCode}/${toCode}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshTrackedRates(): Promise<void> {
    for (const key of this.trackedPairs) {
      const [, , from, to] = key.split(':');
      try {
        const { rate, provider } = await this.fetchRateWithProviders(from, to);
        await this.cacheFxRate(from, to, rate, provider);
      } catch {
        // Keep serving the existing fallback value; nothing further to do here.
      }
    }
  }

  private async fetchRateWithProviders(from: string, to: string): Promise<{ rate: number; provider: string }> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        const rate = await provider.getRate(from, to);
        this.logger.log({ from, to, provider: provider.name }, 'FX rate fetched successfully');
        return { rate, provider: provider.name };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.name}: ${errorMsg}`);
        this.logger.warn({ from, to, provider: provider.name, error: errorMsg }, 'FX provider failed, trying next');
      }
    }

    throw new Error(`All FX providers failed: ${errors.join('; ')}`);
  }

  private async cacheFxRate(from: string, to: string, rate: number, provider: string): Promise<void> {
    const ttlSeconds = this.configService.get<number>(
      'FX_RATE_CACHE_TTL_SECONDS',
      DEFAULT_TTL_SECONDS,
    );

    const cacheData = {
      rate,
      provider,
      fetchedAt: new Date().toISOString(),
    };

    await this.redisService.set(this.buildCacheKey(from, to), JSON.stringify(cacheData), ttlSeconds);
    await this.redisService.set(
      this.buildFallbackKey(from, to),
      JSON.stringify(cacheData),
      FALLBACK_TTL_SECONDS,
    );
  }

  private parseCacheData(data: string): { rate: number; provider: string; fetchedAt: string } {
    try {
      const parsed = JSON.parse(data);
      return {
        rate: parsed.rate,
        provider: parsed.provider || 'unknown',
        fetchedAt: parsed.fetchedAt || new Date().toISOString(),
      };
    } catch {
      // Fallback for old cache format (just a number)
      return {
        rate: Number(data),
        provider: 'unknown',
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  private isRateStale(fetchedAt: string): boolean {
    try {
      const age = (Date.now() - new Date(fetchedAt).getTime()) / 1000;
      return age > MAX_RATE_AGE_SECONDS;
    } catch {
      return true;
    }
  }

  private buildCacheKey(from: string, to: string): string {
    return `fx:rate:${from}:${to}`;
  }

  private buildFallbackKey(from: string, to: string): string {
    return `fx:fallback:${from}:${to}`;
  }
}
