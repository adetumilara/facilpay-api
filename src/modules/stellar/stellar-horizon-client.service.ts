import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

interface UrlHealth {
  url: string;
  healthy: boolean;
  lastChecked: Date;
  unhealthySince?: Date;
  errorCount: number;
}

@Injectable()
export class StellarHorizonClientService {
  private readonly logger = new Logger(StellarHorizonClientService.name);
  private urls: string[];
  private urlHealth: Map<string, UrlHealth> = new Map();
  private readonly cooldownMs = 30000; // 30 seconds
  private currentIndex = 0;

  constructor(private readonly configService: ConfigService) {
    this.urls = this.parseHorizonUrls();
    this.initializeHealthMap();
  }

  private parseHorizonUrls(): string[] {
    const urlsEnv = this.configService.get<string>('STELLAR_HORIZON_URLS');
    const singleUrl = this.configService.get<string>('STELLAR_HORIZON_URL');

    if (urlsEnv) {
      return urlsEnv.split(',').map(url => url.trim());
    } else if (singleUrl) {
      return [singleUrl];
    }

    return ['https://horizon-testnet.stellar.org'];
  }

  private initializeHealthMap(): void {
    for (const url of this.urls) {
      this.urlHealth.set(url, {
        url,
        healthy: true,
        lastChecked: new Date(),
        errorCount: 0,
      });
    }
  }

  getHealthyServer(): StellarSdk.Horizon.Server {
    const healthyUrl = this.getHealthyUrl();
    return new StellarSdk.Horizon.Server(healthyUrl);
  }

  private getHealthyUrl(): string {
    const now = new Date();
    let attempts = 0;

    while (attempts < this.urls.length) {
      const url = this.urls[this.currentIndex % this.urls.length];
      const health = this.urlHealth.get(url)!;

      if (health.healthy) {
        return url;
      }

      if (health.unhealthySince && now.getTime() - health.unhealthySince.getTime() > this.cooldownMs) {
        this.logger.log(`Retrying previously unhealthy URL: ${url}`);
        health.healthy = true;
        health.unhealthySince = undefined;
        health.errorCount = 0;
        return url;
      }

      this.currentIndex++;
      attempts++;
    }

    this.logger.warn('All Horizon URLs unhealthy, returning first URL');
    return this.urls[0];
  }

  recordSuccess(url?: string): void {
    const targetUrl = url || this.urls[this.currentIndex % this.urls.length];
    const health = this.urlHealth.get(targetUrl);
    if (health) {
      health.healthy = true;
      health.errorCount = 0;
      health.unhealthySince = undefined;
      health.lastChecked = new Date();
    }
  }

  recordFailure(url?: string): void {
    const targetUrl = url || this.urls[this.currentIndex % this.urls.length];
    const health = this.urlHealth.get(targetUrl);
    if (health) {
      health.errorCount++;
      health.lastChecked = new Date();

      if (!health.unhealthySince) {
        health.unhealthySince = new Date();
      }

      if (health.errorCount >= 3) {
        health.healthy = false;
        this.logger.warn(`Marking Horizon URL as unhealthy after ${health.errorCount} errors: ${targetUrl}`);
      }
    }

    this.currentIndex++;
  }

  getStatus(): Array<{ url: string; healthy: boolean; errorCount: number; lastChecked: string }> {
    return this.urls.map(url => {
      const health = this.urlHealth.get(url)!;
      return {
        url,
        healthy: health.healthy,
        errorCount: health.errorCount,
        lastChecked: health.lastChecked.toISOString(),
      };
    });
  }
}
