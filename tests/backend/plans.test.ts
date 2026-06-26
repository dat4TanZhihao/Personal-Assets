import { describe, expect, it } from 'vitest';
import { createBackend } from '../../shared/src/backend';
import { MemoryRepository } from '../../shared/src/repositories/memory';
import type { BackendContext, Price } from '../../shared/src/types';

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

async function seedFund(backend: ReturnType<typeof createBackend>, ctx: BackendContext) {
  const account = await backend.upsertAccount({
    type: 'ALIPAY_FUND',
    name: 'Fund account',
    currency: 'CNY',
    active: true
  }, ctx);
  const holding = await backend.upsertHolding({
    accountId: account._id,
    assetType: 'FUND',
    symbol: '000001',
    name: 'Sample fund',
    quantity: 10,
    costAmount: 20,
    costCurrency: 'CNY',
    source: 'MANUAL',
    active: true
  }, ctx);
  return { account, holding };
}

describe('investment plans', () => {
  it('calculates the next run date when creating a weekly fund plan', async () => {
    const { backend } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-plan' });
    const ctx: BackendContext = { userId: login.userId };
    const { account, holding } = await seedFund(backend, ctx);

    const plan = await backend.upsertInvestmentPlan({
      accountId: account._id,
      holdingId: holding._id,
      name: 'Weekly buy',
      amountPerPeriod: 100,
      currency: 'CNY',
      frequency: 'WEEKLY',
      dayOfWeek: 4,
      startDate: '2026-06-01',
      feeRate: 0.01,
      status: 'ACTIVE'
    }, ctx);

    expect(plan.nextRunDate).toBe('2026-06-04');
    expect(plan.assetType).toBe('FUND');
    expect(plan.symbol).toBe('000001');
    expect(plan.nonTradingDayRule).toBe('NEXT_TRADING_DAY');
  });

  it('uses the fund holding account when creating a plan without an account id', async () => {
    const { backend } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-plan-default-account' });
    const ctx: BackendContext = { userId: login.userId };
    const { account, holding } = await seedFund(backend, ctx);

    const plan = await backend.upsertInvestmentPlan({
      holdingId: holding._id,
      name: 'Weekly buy without account id',
      amountPerPeriod: 100,
      currency: 'CNY',
      frequency: 'WEEKLY',
      dayOfWeek: 4,
      startDate: '2026-06-01',
      status: 'ACTIVE'
    }, ctx);

    expect(plan.accountId).toBe(account._id);
  });

  it('executes due plans idempotently and confirms units when fund price exists', async () => {
    const { backend, repo } = newBackend();
    const login = await backend.userLogin({}, { openid: 'openid-execute' });
    const ctx: BackendContext = { userId: login.userId };
    const { account, holding } = await seedFund(backend, ctx);

    const price: Price = {
      _id: 'FUND_000001_2026-06-04',
      assetType: 'FUND',
      symbol: '000001',
      date: '2026-06-04',
      price: 2.5,
      currency: 'CNY',
      source: 'TEST',
      priceStale: false,
      createdAt: fixedNow().toISOString()
    };
    await repo.set('prices', price);

    const plan = await backend.upsertInvestmentPlan({
      accountId: account._id,
      holdingId: holding._id,
      name: 'Weekly buy',
      amountPerPeriod: 100,
      currency: 'CNY',
      frequency: 'WEEKLY',
      dayOfWeek: 4,
      startDate: '2026-06-01',
      feeRate: 0.01,
      status: 'ACTIVE'
    }, ctx);

    const first = await backend.executeInvestmentPlans({ date: '2026-06-04' }, ctx);
    const second = await backend.executeInvestmentPlans({ date: '2026-06-04' }, ctx);

    expect(first.createdCashflowIds).toEqual([`${plan._id}_2026-06-04`]);
    expect(first.confirmedCashflowIds).toEqual([`${plan._id}_2026-06-04`]);
    expect(second.createdCashflowIds).toEqual([]);
    expect(second.confirmedCashflowIds).toEqual([]);

    const cashflows = await backend.listCashflows({}, ctx);
    expect(cashflows.items).toMatchObject([
      {
        _id: `${plan._id}_2026-06-04`,
        planId: plan._id,
        type: 'BUY',
        status: 'CONFIRMED',
        amount: 100,
        feeAmount: 1,
        confirmedPrice: 2.5,
        quantity: 39.6
      }
    ]);

    const holdings = await backend.listHoldings({}, ctx);
    expect(holdings.items[0].quantity).toBeCloseTo(49.6);

    const updatedPlans = await backend.listInvestmentPlans({}, ctx);
    expect(updatedPlans.items[0].nextRunDate).toBe('2026-06-11');
  });
});
