import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { FxRateProvider } from '../fx-rate-provider.interface';

export class ExchangeRateHostProvider implements FxRateProvider {
  readonly name = 'exchangerate-host';

  constructor(private readonly httpService: HttpService) {}

  async getRate(from: string, to: string, timeoutMs = 5000): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.get('https://api.exchangerate.host/latest', {
          params: { base: from, symbols: to },
          timeout: timeoutMs,
        }),
      );

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
