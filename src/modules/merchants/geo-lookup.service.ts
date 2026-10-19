import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as geoip from 'geoip-lite';

interface CacheEntry {
  country: string | null;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_MAX_CACHE_SIZE = 1000;
const DEFAULT_EVICTION_INTERVAL_MS = 60 * 1000;

@Injectable()
export class GeoLookupService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<string, CacheEntry>();
  private evictionTimer?: ReturnType<typeof setInterval>;
  private readonly maxSize: number;
  private readonly evictionIntervalMs: number;

  constructor(private readonly configService: ConfigService) {
    this.maxSize = this.configService.get<number>(
      'GEO_LOOKUP_CACHE_MAX_SIZE',
      DEFAULT_MAX_CACHE_SIZE,
    );
    this.evictionIntervalMs = this.configService.get<number>(
      'GEO_LOOKUP_EVICTION_INTERVAL_MS',
      DEFAULT_EVICTION_INTERVAL_MS,
    );
  }

  onModuleInit(): void {
    if (this.evictionIntervalMs > 0) {
      this.evictionTimer = setInterval(
        () => this.evictExpired(),
        this.evictionIntervalMs,
      );
      // Don't prevent Node from exiting if this is the only timer left
      if (this.evictionTimer.unref) {
        this.evictionTimer.unref();
      }
    }
  }

  onModuleDestroy(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = undefined;
    }
  }

  lookupCountry(ip: string): string | null {
    const cached = this.cache.get(ip);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        // Refresh LRU order: move to end
        this.cache.delete(ip);
        this.cache.set(ip, cached);
        return cached.country;
      }
      // Expired – remove immediately
      this.cache.delete(ip);
    }

    const country = geoip.lookup(ip)?.country ?? null;
    const ttlSeconds = this.configService.get<number>(
      'GEO_LOOKUP_CACHE_TTL_SECONDS',
      DEFAULT_CACHE_TTL_SECONDS,
    );
    const entry: CacheEntry = {
      country,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    this.cache.set(ip, entry);
    this.enforceMaxSize();

    return country;
  }

  /** Remove all expired entries. Called periodically and available for testing. */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /** Alias for evictExpired – kept for backwards compatibility in tests */
  purgeExpired(): number {
    return this.evictExpired();
  }

  /** Returns current cache size (useful for testing / monitoring). */
  getCacheSize(): number {
    return this.cache.size;
  }

  /** Expose cache for testing – read-only view */
  getCacheSnapshot(): Map<string, CacheEntry> {
    return new Map(this.cache);
  }

  private enforceMaxSize(): void {
    while (this.cache.size > this.maxSize) {
      // Map iteration order is insertion order – first key is LRU
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }
}
