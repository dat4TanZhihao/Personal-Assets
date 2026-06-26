import { describe, expect, it } from 'vitest';
import { createBackend } from '../../shared/src/backend';
import type { PriceProvider } from '../../shared/src/providers/prices';
import { MemoryRepository } from '../../shared/src/repositories/memory';
import type { BackendContext } from '../../shared/src/types';

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

describe('core backend handlers', () => {
  it('initializes the owner user once and returns the same base profile on repeat login', async () => {
    const { backend } = newBackend();
    const ctx: BackendContext = { userId: 'owner' };

    const first = await backend.userLogin({}, ctx);
    const second = await backend.userLogin({}, ctx);

    expect(first).toEqual({
      userId: 'owner',
      baseCurrency: 'CNY',
      nickname: 'Web 用户',
      avatarUrl: '',
      profileCompleted: false,
      onboardingCompleted: false,
      gainLossColorMode: 'INTERNATIONAL',
      currentFamilyId: null
    });
    expect(second).toEqual(first);
  });

  it('updates the current user profile, settings, and completes onboarding after first asset exists', async () => {
    const { backend } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-profile' });
    const ctx: BackendContext = { userId: login.userId, openid: 'openid-profile' };

    const profile = await backend.updateUserProfile({
      nickname: 'Ada',
      avatarUrl: 'https://example.com/avatar.png',
      profileSource: 'WECHAT'
    }, ctx);
    const settings = await backend.updateUserSettings({
      gainLossColorMode: 'CHINA_MARKET',
      valuationTime: '20:45'
    }, ctx);

    await expect(backend.completeOnboarding({}, ctx)).rejects.toMatchObject({ code: 'ONBOARDING_ASSET_REQUIRED' });

    const account = await backend.upsertAccount({
      type: 'CASH',
      name: 'Cash account',
      currency: 'CNY',
      active: true
    }, ctx);
    await backend.upsertHolding({
      accountId: account._id,
      assetType: 'CASH',
      symbol: 'CNY',
      name: 'Cash',
      quantity: 100,
      costAmount: 100,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctx);

    const completed = await backend.completeOnboarding({}, ctx);

    expect(profile).toMatchObject({
      nickname: 'Ada',
      avatarUrl: 'https://example.com/avatar.png',
      profileSource: 'WECHAT',
      profileCompleted: true
    });
    expect(settings).toMatchObject({
      gainLossColorMode: 'CHINA_MARKET',
      valuationTime: '20:45'
    });
    expect(completed.onboardingCompleted).toBe(true);
  });

  it('creates accounts, holdings, cashflows and archives holdings without deleting history', async () => {
    const { backend } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-user-a' });
    const ctx: BackendContext = { userId: login.userId, openid: 'openid-user-a' };

    const account = await backend.upsertAccount({
      type: 'ALIPAY_FUND',
      name: 'Alipay funds',
      currency: 'CNY',
      active: true
    }, ctx);

    const holding = await backend.upsertHolding({
      accountId: account._id,
      assetType: 'FUND',
      symbol: '000001',
      name: 'Sample fund',
      quantity: 100,
      costAmount: 200,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctx);

    const cashflow = await backend.upsertCashflow({
      accountId: account._id,
      holdingId: holding._id,
      type: 'BUY',
      amount: 200,
      currency: 'CNY',
      quantity: 100,
      confirmedPrice: 2,
      feeAmount: 0,
      tradeDate: '2026-06-04',
      note: 'initial purchase',
      source: 'MANUAL',
      status: 'CONFIRMED'
    }, ctx);

    expect((await backend.listAccounts({}, ctx)).items).toHaveLength(1);
    expect((await backend.listHoldings({}, ctx)).items).toMatchObject([
      { _id: holding._id, symbol: '000001', active: true }
    ]);
    expect((await backend.listCashflows({}, ctx)).items).toMatchObject([
      { _id: cashflow._id, amount: 200, source: 'MANUAL' }
    ]);

    await backend.deleteHolding({ holdingId: holding._id }, ctx);

    expect((await backend.listHoldings({}, ctx)).items).toEqual([]);
    expect((await backend.listHoldings({ includeArchived: true }, ctx)).items).toMatchObject([
      { _id: holding._id, active: false }
    ]);
    expect((await backend.listCashflows({}, ctx)).items).toHaveLength(1);
  });

  it('creates and reuses system default accounts when holdings omit accountId', async () => {
    const { backend, repo } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-default-holding' });
    const ctx: BackendContext = { userId: login.userId };

    const first = await backend.upsertHolding({
      assetType: 'FUND',
      symbol: '000001',
      name: 'Sample fund',
      quantity: 100,
      costAmount: 200,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctx);
    const second = await backend.upsertHolding({
      assetType: 'FUND',
      symbol: '000002',
      name: 'Second fund',
      quantity: 50,
      costAmount: 80,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctx);
    const updated = await backend.upsertHolding({
      _id: first._id,
      assetType: 'FUND',
      symbol: '000001',
      name: 'Sample fund updated',
      quantity: 120,
      costAmount: 240,
      costCurrency: 'CNY',
      source: 'MANUAL',
      active: true
    }, ctx);

    const accounts = repo.dump('accounts');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      type: 'ALIPAY_FUND',
      name: '默认基金账户',
      currency: 'CNY',
      note: 'SYSTEM_DEFAULT'
    });
    expect(first.accountId).toBe(accounts[0]._id);
    expect(second.accountId).toBe(accounts[0]._id);
    expect(updated.accountId).toBe(first.accountId);
  });

  it('derives cashflow accountId from holding or default cash account when omitted', async () => {
    const { backend, repo } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-default-cashflow' });
    const ctx: BackendContext = { userId: login.userId };
    const holding = await backend.upsertHolding({
      assetType: 'STOCK',
      symbol: 'AAPL',
      name: 'Apple',
      quantity: 1,
      costAmount: 100,
      costCurrency: 'USD',
      market: 'US',
      source: 'MANUAL',
      active: true
    }, ctx);

    const buy = await backend.upsertCashflow({
      holdingId: holding._id,
      type: 'BUY',
      amount: 100,
      currency: 'USD',
      quantity: 1,
      confirmedPrice: 100,
      tradeDate: '2026-06-04',
      source: 'MANUAL',
      status: 'CONFIRMED'
    }, ctx);
    const deposit = await backend.upsertCashflow({
      type: 'DEPOSIT',
      amount: 50,
      currency: 'USD',
      tradeDate: '2026-06-04',
      source: 'MANUAL',
      status: 'CONFIRMED'
    }, ctx);

    const accounts = repo.dump('accounts');
    expect(buy.accountId).toBe(holding.accountId);
    expect(deposit.accountId).not.toBe(holding.accountId);
    expect(accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'STOCK', name: '默认股票账户', currency: 'USD', note: 'SYSTEM_DEFAULT' }),
      expect.objectContaining({ type: 'CASH', name: '默认现金账户', currency: 'USD', note: 'SYSTEM_DEFAULT' })
    ]));
  });

  it('returns an empty dashboard state when the user has no snapshots', async () => {
    const { backend } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-empty' });

    const dashboard = await backend.getDashboard({ range: '7D' }, { userId: login.userId });

    expect(dashboard.summary).toEqual({
      totalValue: 0,
      investedPrincipal: 0,
      dailyInvestmentProfit: 0,
      dailyInvestmentReturn: 0,
      cumulativeInvestmentProfit: 0,
      cumulativeInvestmentReturn: 0,
      snapshotTime: null,
      dataCompleteness: 'COMPLETE',
      priceStatus: 'OK',
      fxStale: false,
      trustNotes: []
    });
    expect(dashboard.scope).toBe('PERSONAL');
    expect(dashboard.profile.nickname).toBe('Web 用户');
    expect(dashboard.breakdown).toEqual({ fund: 0, gold: 0, stock: 0, cash: 0 });
    expect(dashboard.series).toEqual([]);
    expect(dashboard.members).toEqual([]);
  });

  it('syncs prices from active holdings and records provider partial failures', async () => {
    let requestedSymbols: string[] = [];
    const priceProvider: PriceProvider = {
      async sync(input) {
        requestedSymbols = input.holdings.map((holding) => holding.symbol);
        return {
          prices: [
            {
              assetType: 'FUND',
              symbol: '000001',
              date: input.date,
              price: 1.23,
              currency: 'CNY',
              source: 'EASTMONEY_PUBLIC',
              priceStale: false
            }
          ],
          failures: [
            {
              category: 'US_STOCK',
              assetType: 'STOCK',
              symbol: 'AAPL',
              provider: 'ALPHA_VANTAGE',
              reason: 'ALPHA_VANTAGE_API_KEY is not configured'
            }
          ]
        };
      }
    };
    let seq = 0;
    const repo = new MemoryRepository();
    const backend = createBackend({
      repo,
      now: fixedNow,
      idGenerator: (prefix) => `${prefix}_${++seq}`,
      priceProvider
    });
    const login = await backend.userLogin({}, { openid: 'openid-price-sync' });
    const ctx: BackendContext = { userId: login.userId };
    const account = await backend.upsertAccount({ type: 'ALIPAY_FUND', name: 'Assets', currency: 'CNY', active: true }, ctx);
    await backend.upsertHolding({ accountId: account._id, assetType: 'FUND', symbol: '000001', name: 'Fund', quantity: 100, costAmount: 100, costCurrency: 'CNY', source: 'MANUAL', active: true }, ctx);
    await backend.upsertHolding({ accountId: account._id, assetType: 'STOCK', symbol: 'AAPL', name: 'Apple', quantity: 1, costAmount: 100, costCurrency: 'USD', market: 'US', source: 'MANUAL', active: true }, ctx);
    await backend.upsertHolding({ accountId: account._id, assetType: 'STOCK', symbol: 'MSFT', name: 'Archived', quantity: 1, costAmount: 100, costCurrency: 'USD', market: 'US', source: 'MANUAL', active: false }, ctx);

    const result = await backend.syncPrices({ date: '2026-06-04' }, ctx);

    expect(requestedSymbols).toEqual(['000001', 'AAPL']);
    expect(result.status).toBe('PARTIAL');
    expect(result.upsertedPriceIds).toEqual(['FUND_000001_2026-06-04']);
    expect(result.failures).toEqual([
      expect.objectContaining({ category: 'US_STOCK', symbol: 'AAPL', provider: 'ALPHA_VANTAGE' })
    ]);
    expect(result.sourceStatuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'FUND', status: 'SUCCESS', upserted: 1 }),
      expect.objectContaining({ key: 'US_STOCK', status: 'FAILED', failures: 1 })
    ]));
    expect(await repo.get('prices', 'FUND_000001_2026-06-04')).toMatchObject({
      assetType: 'FUND',
      symbol: '000001',
      price: 1.23
    });
    const jobs = repo.dump('sync_jobs');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'PARTIAL' });
    expect(jobs[0].metadata).toMatchObject({
      upsertedPriceIds: ['FUND_000001_2026-06-04'],
      failures: [expect.objectContaining({ symbol: 'AAPL' })]
    });
  });

  it('includes the latest available price when listing holdings', async () => {
    const { backend, repo } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-latest-price' });
    const ctx: BackendContext = { userId: login.userId };
    const account = await backend.upsertAccount({ type: 'STOCK', name: 'Stocks', currency: 'CNY', active: true }, ctx);
    await backend.upsertHolding({
      accountId: account._id,
      assetType: 'STOCK',
      symbol: '600519.SH',
      name: 'Kweichow Moutai',
      quantity: 2,
      costAmount: 3000,
      costCurrency: 'CNY',
      market: 'CN',
      source: 'MANUAL',
      active: true
    }, ctx);
    await repo.set('prices', {
      _id: 'STOCK_600519.SH_2026-06-03',
      assetType: 'STOCK',
      symbol: '600519.SH',
      date: '2026-06-03',
      price: 1510.5,
      currency: 'CNY',
      source: 'EASTMONEY_PUBLIC',
      priceStale: true,
      createdAt: fixedNow().toISOString()
    });

    const result = await backend.listHoldings({}, ctx);

    expect(result.items[0]).toMatchObject({
      symbol: '600519.SH',
      latestPrice: {
        symbol: '600519.SH',
        date: '2026-06-03',
        price: 1510.5,
        currency: 'CNY',
        source: 'EASTMONEY_PUBLIC',
        priceStale: true
      }
    });
  });
});
