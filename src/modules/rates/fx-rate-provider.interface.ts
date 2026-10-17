export interface FxRateProvider {
  name: string;
  getRate(from: string, to: string, timeoutMs?: number): Promise<number>;
}

export interface RateInfo {
  rate: number;
  source: string;
  fetchedAt: Date;
  isStale?: boolean;
}
