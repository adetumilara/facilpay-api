import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { FxRateProvider } from '../fx-rate-provider.interface';

export class FixerIoProvider implements FxRateProvider {
  readonly name = 'fixer-io';
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('FIXER_IO_API_KEY', '');
  }

  async getRate(from: string, to: string, timeoutMs = 5000): Promise<number> {
    if (!this.apiKey) {
      throw new Error(`${this.name} not configured (missing FIXER_IO_API_KEY)`);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://api.fixer.io/latest', {
          params: {
            access_key: this.apiKey,
            base: from,
            symbols: to,
          },
          timeout: timeoutMs,
        }),
      );

      if (!response.data.success) {
        throw new Error(response.data.error?.info || 'Fixer.io request failed');
      }

      const rate = response.data?.rates?.[to];
      if (typeof rate !== 'number') {
        throw new Error(`Provider response did not include a rate for ${from}/${to}`);
      }

      return rate;
    } catch (error) {
      throw new Error(`${this.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
