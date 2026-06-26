import { describe, expect, it } from 'vitest';
import { createFreeMarketDataPriceProvider } from '../../shared/src/providers/marketData';
import type { MarketDataSyncRequest } from '../../shared/src/providers/prices';
import type { Holding } from '../../shared/src/types';

const baseHolding = {
  _id: 'holding',
  userId: 'user-1',
  accountId: 'account-1',
  name: 'Holding',
  quantity: 1,
  costAmount: 1,
  costCurrency: 'CNY',
  source: 'MANUAL',
  active: true,
  createdAt: '2026-06-04T10:00:00.000Z',
  updatedAt: '2026-06-04T10:00:00.000Z'
} satisfies Omit<Holding, 'assetType' | 'symbol'>;

function holding(input: Pick<Holding, 'assetType' | 'symbol'> & Partial<Holding>): Holding {
  return {
    ...baseHolding,
    ...input,
    _id: input._id ?? `${input.assetType}-${input.symbol}`
  };
}

function request(holdings: Holding[]): MarketDataSyncRequest {
  return {
    userId: 'user-1',
    date: '2026-06-04',
    baseCurrency: 'CNY',
    currencies: ['CNY', 'USD'],
    holdings
  };
}

describe('free market data price provider', () => {
  it('maps free fund, CN stock, US stock, gold, and FX responses into prices', async () => {
    const provider = createFreeMarketDataPriceProvider({
      alphaVantageApiKey: 'alpha-key',
      httpGet: async (url) => {
        if (url.includes('fundgz.1234567.com.cn')) {
          return 'jsonpgz({"fundcode":"000001","dwjz":"1.2340","jzrq":"2026-06-04"});';
        }
        if (url.includes('qt.gtimg.cn')) {
          return 'v_sh600519="1~贵州茅台~600519~12.30~11.50~11.50~~~~~~~~~~~~~~~~~~~~~~~~~~20260604150000";';
        }
        if (url.includes('function=GLOBAL_QUOTE')) {
          return JSON.stringify({
            'Global Quote': {
              '05. price': '188.88',
              '07. latest trading day': '2026-06-04'
            }
          });
        }
        if (url.includes('from_currency=XAU')) {
          return JSON.stringify({
            'Realtime Currency Exchange Rate': {
              '5. Exchange Rate': '2450',
              '6. Last Refreshed': '2026-06-04 18:00:00'
            }
          });
        }
        if (url.includes('frankfurter')) {
          return JSON.stringify({
            amount: 1,
            base: 'USD',
            date: '2026-06-04',
            rates: { CNY: 7.25 }
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      }
    });

    const result = await provider.sync(request([
      holding({ assetType: 'FUND', symbol: '000001' }),
      holding({ assetType: 'STOCK', symbol: '600519', market: 'CN' }),
      holding({ assetType: 'STOCK', symbol: 'AAPL', market: 'US', costCurrency: 'USD' }),
      holding({ assetType: 'GOLD', symbol: 'CCB_GOLD' })
    ]));

    expect(result.failures).toEqual([]);
    expect(result.prices).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetType: 'FUND', symbol: '000001', date: '2026-06-04', price: 1.234, currency: 'CNY', source: 'EASTMONEY_PUBLIC' }),
      expect.objectContaining({ assetType: 'STOCK', symbol: '600519.SH', date: '2026-06-04', price: 12.3, currency: 'CNY', source: 'TENCENT_PUBLIC' }),
      expect.objectContaining({ assetType: 'STOCK', symbol: 'AAPL', date: '2026-06-04', price: 188.88, currency: 'USD', source: 'ALPHA_VANTAGE' }),
      expect.objectContaining({ assetType: 'FX', symbol: 'USD_CNY', date: '2026-06-04', price: 7.25, currency: 'CNY', source: 'FRANKFURTER' })
    ]));
    const gold = result.prices.find((price) => price.assetType === 'GOLD' && price.symbol === 'CCB_GOLD');
    expect(gold?.currency).toBe('CNY');
    expect(gold?.source).toBe('ALPHA_VANTAGE_XAU_FX');
    expect(gold?.price).toBeCloseTo((2450 * 7.25) / 31.1034768, 2);
  });

  it('records Alpha Vantage failures instead of throwing when the free key is missing', async () => {
    const provider = createFreeMarketDataPriceProvider({
      httpGet: async (url) => {
        if (url.includes('frankfurter')) {
          return JSON.stringify({ amount: 1, base: 'USD', date: '2026-06-04', rates: { CNY: 7.25 } });
        }
        throw new Error(`Unexpected URL ${url}`);
      }
    });

    const result = await provider.sync(request([
      holding({ assetType: 'STOCK', symbol: 'AAPL', market: 'US', costCurrency: 'USD' }),
      holding({ assetType: 'GOLD', symbol: 'CCB_GOLD' })
    ]));

    expect(result.prices).toEqual([
      expect.objectContaining({ assetType: 'FX', symbol: 'USD_CNY', source: 'FRANKFURTER' })
    ]);
    expect(result.failures).toEqual([
      expect.objectContaining({ category: 'US_STOCK', provider: 'ALPHA_VANTAGE', symbol: 'AAPL' }),
      expect.objectContaining({ category: 'GOLD', provider: 'ALPHA_VANTAGE', symbol: 'CCB_GOLD' })
    ]);
  });

  it('falls back to Yahoo gold futures when Alpha Vantage gold is rate limited', async () => {
    const provider = createFreeMarketDataPriceProvider({
      alphaVantageApiKey: 'alpha-key',
      httpGet: async (url) => {
        if (url.includes('frankfurter')) {
          return JSON.stringify({ amount: 1, base: 'USD', date: '2026-06-04', rates: { CNY: 7.25 } });
        }
        if (url.includes('from_currency=XAU')) {
          return JSON.stringify({
            Information: 'Thank you for using Alpha Vantage! Please consider spreading out your free API requests.'
          });
        }
        if (url.includes('query1.finance.yahoo.com')) {
          return JSON.stringify({
            chart: {
              result: [{
                timestamp: [1780531200, 1780617600],
                indicators: {
                  quote: [{
                    close: [2440.5, 2450]
                  }]
                }
              }]
            }
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      }
    });

    const result = await provider.sync(request([
      holding({ assetType: 'GOLD', symbol: 'CCB_GOLD' })
    ]));

    expect(result.failures).toEqual([]);
    expect(result.prices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetType: 'GOLD',
        symbol: 'CCB_GOLD',
        source: 'YAHOO_FINANCE_GC_F_FALLBACK',
        currency: 'CNY'
      })
    ]));
    const gold = result.prices.find((price) => price.assetType === 'GOLD');
    expect(gold?.price).toBeCloseTo((2450 * 7.25) / 31.1034768, 2);
  });
});
