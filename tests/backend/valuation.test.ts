import { describe, expect, it } from 'vitest';
import { createBackend } from '../../shared/src/backend';
import { MemoryRepository } from '../../shared/src/repositories/memory';
import type { BackendContext, DailySnapshot, Price } from '../../shared/src/types';

const fixedNow = () => new Date('2026-06-04T10:00:00.000Z');

function newBackend() {
  let seq = 0;
  const repo = new MemoryRepository();
  const backend = createBackend({
    repo,
    now: fixedNow,
    idGenerator: (prefix) => `${prefix}_${++seq}`
  });
  return { backend, repo };
}

async function seedPrice(repo: MemoryRepository, price: Omit<Price, '_id' | 'createdAt'>) {
  await repo.set('prices', {
    _id: `${price.assetType}_${price.symbol}_${price.date}`,
    createdAt: fixedNow().toISOString(),
    ...price
  });
}

describe('daily valuation snapshots and dashboard series', () => {
  it('values assets in CNY, marks stale FX, and corrects daily profit for cashflow', async () => {
    const { backend, repo } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-valuation' });
    const ctx: BackendContext = { userId: login.userId };

    const fundAccount = await backend.upsertAccount({ type: 'ALIPAY_FUND', name: 'Funds', currency: 'CNY', active: true }, ctx);
    const goldAccount = await backend.upsertAccount({ type: 'CCB_GOLD', name: 'Gold', currency: 'CNY', active: true }, ctx);
    const stockAccount = await backend.upsertAccount({ type: 'STOCK', name: 'Manual stocks', currency: 'USD', active: true }, ctx);

    await backend.upsertHolding({ accountId: fundAccount._id, assetType: 'FUND', symbol: '000001', name: 'Fund', quantity: 100, costAmount: 800, costCurrency: 'CNY', source: 'MANUAL', active: true }, ctx);
    await backend.upsertHolding({ accountId: goldAccount._id, assetType: 'GOLD', symbol: 'CCB_GOLD', name: 'Gold', quantity: 10, costAmount: 5000, costCurrency: 'CNY', source: 'MANUAL', active: true }, ctx);
    await backend.upsertHolding({ accountId: stockAccount._id, assetType: 'STOCK', symbol: 'AAPL', name: 'Apple', quantity: 2, costAmount: 200, costCurrency: 'USD', market: 'US', source: 'MANUAL', active: true }, ctx);

    await seedPrice(repo, { assetType: 'FUND', symbol: '000001', date: '2026-06-04', price: 9, currency: 'CNY', source: 'TEST', priceStale: false });
    await seedPrice(repo, { assetType: 'GOLD', symbol: 'CCB_GOLD', date: '2026-06-04', price: 520, currency: 'CNY', source: 'TEST', priceStale: false });
    await seedPrice(repo, { assetType: 'STOCK', symbol: 'AAPL', date: '2026-06-04', price: 200, currency: 'USD', source: 'TEST', priceStale: false });
    await seedPrice(repo, { assetType: 'FX', symbol: 'USD_CNY', date: '2026-06-03', price: 7, currency: 'CNY', source: 'TEST', priceStale: false });

    const previous: DailySnapshot = {
      _id: `${login.userId}_2026-06-03`,
      userId: login.userId,
      date: '2026-06-03',
      baseCurrency: 'CNY',
      totalValue: 8000,
      totalValueOriginal: [],
      fxRatesUsed: {},
      fxStale: false,
      investedPrincipal: 7100,
      netInflow: 0,
      dailyInvestmentProfit: 0,
      dailyInvestmentReturn: 0,
      cumulativeInvestmentProfit: 900,
      cumulativeInvestmentReturn: 900 / 7100,
      breakdown: { fund: 0, gold: 0, stock: 0, cash: 0 },
      priceStatus: 'OK',
      dataCompleteness: 'COMPLETE',
      trustNotes: [],
      generatedBy: 'MANUAL',
      generatedAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z'
    };
    await repo.set('daily_snapshots', previous);

    await backend.upsertCashflow({
      accountId: fundAccount._id,
      type: 'DEPOSIT',
      amount: 100,
      currency: 'CNY',
      tradeDate: '2026-06-04',
      source: 'MANUAL',
      status: 'CONFIRMED'
    }, ctx);

    const snapshot = await backend.generateDailySnapshot({ date: '2026-06-04', generatedBy: 'MANUAL' }, ctx);

    expect(snapshot.totalValue).toBe(8900);
    expect(snapshot.breakdown).toEqual({ fund: 900, gold: 5200, stock: 2800, cash: 0 });
    expect(snapshot.fxStale).toBe(true);
    expect(snapshot.priceStatus).toBe('STALE');
    expect(snapshot.dataCompleteness).toBe('PARTIAL');
    expect(snapshot.trustNotes).toEqual([
      '使用最近可用汇率',
      '部分资产使用历史价格估值'
    ]);
    expect(snapshot.fxRatesUsed).toEqual({ USD_CNY: { rate: 7, date: '2026-06-03', stale: true } });
    expect(snapshot.netInflow).toBe(100);
    expect(snapshot.investedPrincipal).toBe(7200);
    expect(snapshot.dailyInvestmentProfit).toBe(800);
    expect(snapshot.dailyInvestmentReturn).toBeCloseTo(800 / 8100);
    expect(snapshot.cumulativeInvestmentProfit).toBe(1700);
    expect(snapshot.cumulativeInvestmentReturn).toBeCloseTo(1700 / 7200);
    expect(snapshot.totalValueOriginal).toEqual([
      { currency: 'CNY', amount: 6100 },
      { currency: 'USD', amount: 400 }
    ]);

    const dashboard = await backend.getDashboard({ range: '7D' }, ctx);
    expect(dashboard.summary.totalValue).toBe(8900);
    expect(dashboard.summary.investedPrincipal).toBe(7200);
    expect(dashboard.summary.dailyInvestmentProfit).toBe(800);
    expect(dashboard.summary.trustNotes).toContain('使用最近可用汇率');
    expect(dashboard.series.map((point) => point.date)).toEqual(['2026-06-03', '2026-06-04']);
  });
});
