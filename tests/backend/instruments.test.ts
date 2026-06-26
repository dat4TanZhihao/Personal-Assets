import { describe, expect, it } from 'vitest';
import { searchInstruments } from '../../shared/src/services/instruments';

describe('instrument search', () => {
  it('returns built-in suggestions for common stock codes', async () => {
    const result = await searchInstruments({ query: 'AAPL', assetType: 'STOCK' }, {
      httpGet: async () => {
        throw new Error('external search unavailable');
      }
    });

    expect(result.items).toEqual([
      expect.objectContaining({ assetType: 'STOCK', symbol: 'AAPL', name: 'Apple Inc.', market: 'US' })
    ]);
  });

  it('maps Alpha Vantage symbol search responses into selectable instruments', async () => {
    const result = await searchInstruments({ query: 'IBM', assetType: 'STOCK' }, {
      alphaVantageApiKey: 'test-key',
      httpGet: async (url) => {
        if (url.includes('SYMBOL_SEARCH')) {
          return JSON.stringify({
            bestMatches: [
              {
                '1. symbol': 'IBM',
                '2. name': 'International Business Machines',
                '8. currency': 'USD'
              }
            ]
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      }
    });

    expect(result.items).toEqual([
      expect.objectContaining({ assetType: 'STOCK', symbol: 'IBM', name: 'International Business Machines', source: 'ALPHA_VANTAGE_SYMBOL_SEARCH' })
    ]);
  });
});
