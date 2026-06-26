import type { Currency, Holding, MarketDataFailure, Price, SyncPricesInput } from '../types';

export interface MarketDataSyncRequest extends SyncPricesInput {
  userId: string;
  date: string;
  holdings: Holding[];
  currencies: Currency[];
  baseCurrency: 'CNY';
}

export interface MarketDataSyncResult {
  prices: Array<Omit<Price, '_id' | 'createdAt'>>;
  failures: MarketDataFailure[];
}

export interface PriceProvider {
  sync(input: MarketDataSyncRequest): Promise<MarketDataSyncResult>;
}
