import type { Repository } from '../repositories/types';
import type { Cashflow, Currency, DailySnapshot, FxRateUsed, Holding, Price, SnapshotPriceStatus } from '../types';
import { priceSymbolCandidates } from '../utils/prices';

export async function generateSnapshot(input: {
  repo: Repository;
  userId: string;
  date: string;
  now: string;
  generatedBy: 'SCHEDULED' | 'MANUAL';
}): Promise<DailySnapshot> {
  const accounts = (await input.repo.list('accounts', { userId: input.userId }))
    .filter((account) => account.active);
  const accountIds = new Set(accounts.map((account) => account._id));
  const holdings = (await input.repo.list('holdings', { userId: input.userId }))
    .filter((holding) => holding.active && accountIds.has(holding.accountId));

  const breakdown = { fund: 0, gold: 0, stock: 0, cash: 0 };
  const originalTotals = new Map<Currency, number>();
  const fxRatesUsed: Record<string, FxRateUsed> = {};
  let totalValue = 0;
  let totalCostBasis = 0;
  let missingData = false;
  let staleData = false;
  let fxStale = false;

  for (const holding of holdings) {
    const valuation = await valueHolding(input.repo, holding, input.date);
    if (!valuation) {
      missingData = true;
      continue;
    }

    totalValue += valuation.baseValue;
    totalCostBasis += valuation.baseCost;
    breakdown[assetKey(holding)] += valuation.baseValue;
    originalTotals.set(valuation.originalCurrency, (originalTotals.get(valuation.originalCurrency) ?? 0) + valuation.originalValue);

    if (valuation.priceStale || valuation.fxStale) {
      staleData = true;
    }
    if (valuation.missingFx) {
      missingData = true;
    }
    if (valuation.fxStale) {
      fxStale = true;
    }
    if (valuation.fxRate) {
      fxRatesUsed[valuation.fxPair] = valuation.fxRate;
    }
  }

  const netInflow = await cashflowNetInflow(input.repo, input.userId, input.date);
  const previous = await previousSnapshot(input.repo, input.userId, input.date);
  const investedPrincipal = previous
    ? roundMoney(previous.investedPrincipal + netInflow)
    : roundMoney(totalCostBasis);
  const dailyInvestmentProfit = previous ? roundMoney(totalValue - previous.totalValue - netInflow) : 0;
  const dailyBase = previous ? previous.totalValue + Math.max(netInflow, 0) : 0;
  const dailyInvestmentReturn = dailyBase > 0 ? dailyInvestmentProfit / dailyBase : 0;
  const cumulativeInvestmentProfit = investedPrincipal > 0 ? roundMoney(totalValue - investedPrincipal) : 0;
  const cumulativeInvestmentReturn = investedPrincipal > 0 ? cumulativeInvestmentProfit / investedPrincipal : 0;
  const priceStatus: SnapshotPriceStatus = missingData ? 'PARTIAL' : staleData ? 'STALE' : 'OK';
  const dataCompleteness = missingData ? 'INCOMPLETE' : staleData || fxStale ? 'PARTIAL' : 'COMPLETE';
  const trustNotes = trustNotesFor({ missingData, staleData, fxStale });

  const snapshot: DailySnapshot = {
    _id: `${input.userId}_${input.date}`,
    userId: input.userId,
    date: input.date,
    baseCurrency: 'CNY',
    totalValue: roundMoney(totalValue),
    totalValueOriginal: Array.from(originalTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: roundMoney(amount) })),
    fxRatesUsed,
    fxStale,
    investedPrincipal,
    netInflow: roundMoney(netInflow),
    dailyInvestmentProfit,
    dailyInvestmentReturn,
    cumulativeInvestmentProfit,
    cumulativeInvestmentReturn,
    breakdown: {
      fund: roundMoney(breakdown.fund),
      gold: roundMoney(breakdown.gold),
      stock: roundMoney(breakdown.stock),
      cash: roundMoney(breakdown.cash)
    },
    priceStatus,
    dataCompleteness,
    trustNotes,
    generatedBy: input.generatedBy,
    generatedAt: input.now,
    updatedAt: input.now
  };

  await input.repo.set('daily_snapshots', snapshot);
  return snapshot;
}

async function valueHolding(repo: Repository, holding: Holding, date: string): Promise<{
  originalCurrency: Currency;
  originalValue: number;
  baseValue: number;
  baseCost: number;
  priceStale: boolean;
  fxStale: boolean;
  missingFx: boolean;
  fxPair: string;
  fxRate?: FxRateUsed;
} | undefined> {
  const price = holding.assetType === 'CASH'
    ? cashPrice(holding, date)
    : await latestPrice(repo, holding.assetType, holding.symbol, date);
  if (!price || price.price <= 0) {
    return undefined;
  }

  const originalValue = holding.quantity * price.price;
  const conversion = await convertToCny(repo, price.currency, originalValue, date);
  const costConversion = await convertToCny(repo, holding.costCurrency, holding.costAmount, date);
  if (!conversion || !costConversion) {
    return {
      originalCurrency: price.currency,
      originalValue,
      baseValue: 0,
      baseCost: 0,
      priceStale: price.priceStale || price.date !== date,
      fxStale: false,
      missingFx: true,
      fxPair: `${price.currency}_CNY`
    };
  }

  return {
    originalCurrency: price.currency,
    originalValue,
    baseValue: conversion.amount,
    baseCost: costConversion.amount,
    priceStale: price.priceStale || price.date !== date,
    fxStale: conversion.rate?.stale || costConversion.rate?.stale || false,
    missingFx: false,
    fxPair: conversion.pair,
    fxRate: conversion.rate
  };
}

async function convertToCny(repo: Repository, currency: Currency, amount: number, date: string): Promise<{ amount: number; pair: string; rate?: FxRateUsed } | undefined> {
  if (currency === 'CNY') {
    return { amount, pair: 'CNY_CNY' };
  }
  const pair = `${currency}_CNY`;
  const fx = await latestPrice(repo, 'FX', pair, date);
  if (!fx || fx.price <= 0) {
    return undefined;
  }
  return {
    amount: amount * fx.price,
    pair,
    rate: {
      rate: fx.price,
      date: fx.date,
      stale: fx.priceStale || fx.date !== date
    }
  };
}

async function latestPrice(repo: Repository, assetType: Price['assetType'], symbol: string, date: string): Promise<Price | undefined> {
  const candidates = new Set(priceSymbolCandidates(assetType, symbol));
  return (await repo.list('prices', (price) => price.assetType === assetType && candidates.has(price.symbol) && price.date <= date))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function cashPrice(holding: Holding, date: string): Price {
  return {
    _id: `CASH_${holding.costCurrency}_${date}`,
    assetType: 'CASH',
    symbol: holding.costCurrency,
    date,
    price: 1,
    currency: holding.costCurrency,
    source: 'CASH',
    priceStale: false,
    createdAt: date
  };
}

async function cashflowNetInflow(repo: Repository, userId: string, date: string): Promise<number> {
  const cashflows = (await repo.list('cashflows', { userId }))
    .filter((cashflow) => cashflow.status !== 'CANCELLED' && cashflow.status !== 'PENDING' && cashflow.status !== 'SKIPPED' && cashflow.tradeDate === date);
  let total = 0;
  for (const cashflow of cashflows) {
    const direction = cashflowDirection(cashflow);
    if (direction === 0) {
      continue;
    }
    const converted = await convertToCny(repo, cashflow.currency, cashflow.amount, date);
    total += direction * (converted?.amount ?? 0);
  }
  return total;
}

function cashflowDirection(cashflow: Cashflow): number {
  switch (cashflow.type) {
    case 'BUY':
    case 'DEPOSIT':
      return 1;
    case 'SELL':
    case 'WITHDRAW':
      return -1;
    default:
      return 0;
  }
}

async function previousSnapshot(repo: Repository, userId: string, date: string): Promise<DailySnapshot | undefined> {
  return (await repo.list('daily_snapshots', (snapshot) => snapshot.userId === userId && snapshot.date < date))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function trustNotesFor(input: { missingData: boolean; staleData: boolean; fxStale: boolean }): string[] {
  const notes: string[] = [];
  if (input.fxStale) {
    notes.push('使用最近可用汇率');
  }
  if (input.staleData) {
    notes.push('部分资产使用历史价格估值');
  }
  if (input.missingData) {
    notes.push('数据不完整：部分行情或汇率缺失');
  }
  return notes;
}

function assetKey(holding: Holding): keyof DailySnapshot['breakdown'] {
  if (holding.assetType === 'FUND') {
    return 'fund';
  }
  if (holding.assetType === 'GOLD') {
    return 'gold';
  }
  if (holding.assetType === 'STOCK') {
    return 'stock';
  }
  return 'cash';
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
