import { ApiError, assertCondition, forbidden, notFound } from './errors';
import { createNotConfiguredIbkrProvider, type IbkrProvider } from './providers/ibkr';
import { createFreeMarketDataPriceProvider } from './providers/marketData';
import { type PriceProvider } from './providers/prices';
import type { Repository } from './repositories/types';
import { buildDashboard } from './services/dashboard';
import { resolveInstrument, searchInstruments as searchMarketInstruments } from './services/instruments';
import { executeDueInvestmentPlans, nextRunForPlan } from './services/plans';
import { finishSyncJob, startSyncJob } from './services/syncJobs';
import { generateSnapshot } from './services/valuation';
import type {
  Account,
  BackendContext,
  BackendHandlers,
  Cashflow,
  CompleteOnboardingInput,
  DashboardInput,
  DeleteAccountInput,
  DeleteCashflowInput,
  DeleteHoldingInput,
  DeleteInvestmentPlanInput,
  ExportDataInput,
  ExportDataOutput,
  GenerateDailySnapshotInput,
  Holding,
  InvestmentPlan,
  ListAccountsInput,
  ListCashflowsInput,
  ListHoldingsOutput,
  ListHoldingsInput,
  ListInvestmentPlansInput,
  MarketDataFailure,
  MarketDataSourceKey,
  MarketDataSourceStatus,
  Price,
  ProfileSource,
  SyncJobStatus,
  SyncPricesInput,
  SyncPricesOutput,
  UpdateUserProfileInput,
  UpdateUserSettingsInput,
  UpsertAccountInput,
  UpsertCashflowInput,
  UpsertHoldingInput,
  UpsertInvestmentPlanInput,
  User,
  UserLoginInput,
  UserLoginOutput
} from './types';
import { toCsv } from './utils/csv';
import { toDateString } from './utils/date';
import { type IdGenerator, randomId } from './utils/id';
import { priceSymbolCandidates } from './utils/prices';

export interface BackendDeps {
  repo: Repository;
  now?: () => Date;
  idGenerator?: IdGenerator;
  ibkrProvider?: IbkrProvider;
  priceProvider?: PriceProvider;
}

export function createBackend(deps: BackendDeps): BackendHandlers {
  const repo = deps.repo;
  const now = deps.now ?? (() => new Date());
  const idGenerator = deps.idGenerator ?? randomId;
  const ibkrProvider = deps.ibkrProvider ?? createNotConfiguredIbkrProvider();
  const priceProvider = deps.priceProvider ?? createFreeMarketDataPriceProvider();

  const nowIso = () => now().toISOString();
  const today = () => toDateString(now());

  async function userLogin(_: UserLoginInput, ctx: BackendContext): Promise<UserLoginOutput> {
    const user = await findOrCreateUser(ctx);
    return userLoginOutput(user);
  }

  async function updateUserProfile(input: UpdateUserProfileInput, ctx: BackendContext): Promise<User> {
    const user = await findOrCreateUser(ctx);
    const nickname = input.nickname?.trim();
    assertCondition(nickname && nickname.length <= 30, 'INVALID_PROFILE', 'nickname must be 1-30 characters', 422);
    const profileSource = input.profileSource ?? 'MANUAL';
    assertProfileSource(profileSource);
    return repo.patch('users', user._id, {
      nickname,
      avatarUrl: input.avatarUrl ?? '',
      profileSource,
      profileCompleted: true,
      updatedAt: nowIso()
    });
  }

  async function updateUserSettings(input: UpdateUserSettingsInput, ctx: BackendContext): Promise<User> {
    const user = await findOrCreateUser(ctx);
    const updates: Partial<User> = { updatedAt: nowIso() };
    if (input.gainLossColorMode !== undefined) {
      assertCondition(
        input.gainLossColorMode === 'INTERNATIONAL' || input.gainLossColorMode === 'CHINA_MARKET',
        'INVALID_COLOR_MODE',
        'gainLossColorMode must be INTERNATIONAL or CHINA_MARKET',
        422
      );
      updates.gainLossColorMode = input.gainLossColorMode;
    }
    if (input.valuationTime !== undefined) {
      assertCondition(/^([01]\d|2[0-3]):[0-5]\d$/.test(input.valuationTime), 'INVALID_VALUATION_TIME', 'valuationTime must be HH:mm', 422);
      updates.valuationTime = input.valuationTime;
    }
    return repo.patch('users', user._id, updates);
  }

  async function completeOnboarding(_: CompleteOnboardingInput, ctx: BackendContext): Promise<User> {
    const user = await findOrCreateUser(ctx);
    const hasAsset = (await repo.list('holdings', { userId: user._id })).some((holding) => holding.active);
    assertCondition(hasAsset, 'ONBOARDING_ASSET_REQUIRED', 'At least one active holding is required before onboarding can be completed', 422);
    return repo.patch('users', user._id, { onboardingCompleted: true, updatedAt: nowIso() });
  }

  async function listAccounts(input: ListAccountsInput, ctx: BackendContext) {
    const userId = requireUser(ctx);
    const items = (await repo.list('accounts', { userId }))
      .filter((account) => input.includeDisabled || account.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items };
  }

  async function upsertAccount(input: UpsertAccountInput, ctx: BackendContext): Promise<Account> {
    const userId = requireUser(ctx);
    assertNonEmpty(input.name, 'name');
    assertNonEmpty(input.type, 'type');
    assertNonEmpty(input.currency, 'currency');
    const timestamp = nowIso();

    if (input._id) {
      const existing = await ownedAccount(input._id, userId);
      const updated: Account = {
        ...existing,
        type: input.type,
        name: input.name,
        currency: input.currency,
        active: input.active ?? existing.active,
        note: input.note,
        updatedAt: timestamp
      };
      return repo.set('accounts', updated);
    }

    const account: Account = {
      _id: idGenerator('account'),
      userId,
      type: input.type,
      name: input.name,
      currency: input.currency,
      active: input.active ?? true,
      note: input.note,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return repo.set('accounts', account);
  }

  async function deleteAccount(input: DeleteAccountInput, ctx: BackendContext): Promise<Account> {
    const userId = requireUser(ctx);
    const account = await ownedAccount(input.accountId, userId);
    return repo.patch('accounts', account._id, { active: false, updatedAt: nowIso() });
  }

  async function searchInstruments(input: { query: string; assetType?: Holding['assetType'] }, ctx: BackendContext) {
    requireUser(ctx);
    return searchMarketInstruments(input, marketSearchOptions());
  }

  async function listHoldings(input: ListHoldingsInput, ctx: BackendContext): Promise<ListHoldingsOutput> {
    const userId = requireUser(ctx);
    const items = (await repo.list('holdings', { userId }))
      .filter((holding) => input.includeArchived || holding.active)
      .filter((holding) => !input.accountId || holding.accountId === input.accountId)
      .filter((holding) => !input.assetType || holding.assetType === input.assetType)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      items: await Promise.all(items.map(async (holding) => ({
        ...holding,
        latestPrice: await latestHoldingPrice(repo, holding, today())
      })))
    };
  }

  async function upsertHolding(input: UpsertHoldingInput, ctx: BackendContext): Promise<Holding> {
    const userId = requireUser(ctx);
    assertNonEmpty(input.symbol, 'symbol');
    assertNonEmpty(input.name, 'name');
    assertPositiveOrZero(input.quantity, 'quantity');
    assertPositiveOrZero(input.costAmount, 'costAmount');
    assertNonEmpty(input.costCurrency, 'costCurrency');
    const instrument = await resolveInstrument({ query: input.symbol, assetType: input.assetType }, {
      ...marketSearchOptions(),
      instrumentToken: input.instrumentToken,
      requireInstrumentToken: !input._id && requireInstrumentToken()
    });
    assertCondition(instrument, 'UNKNOWN_INSTRUMENT', 'Select a valid instrument from the search results before adding a holding', 422);
    const timestamp = nowIso();

    if (input._id) {
      const existing = await ownedHolding(input._id, userId);
      const accountId = input.accountId
        ? (await ownedAccount(input.accountId, userId))._id
        : existing.accountId;
      const updated: Holding = {
        ...existing,
        accountId,
        assetType: input.assetType,
        symbol: instrument.symbol,
        name: instrument.name,
        market: instrument.market ?? input.market,
        quantity: input.quantity,
        costAmount: input.costAmount,
        costCurrency: input.costCurrency,
        source: input.source,
        active: input.active ?? existing.active,
        updatedAt: timestamp
      };
      return repo.set('holdings', updated);
    }

    const accountId = input.accountId
      ? (await ownedAccount(input.accountId, userId))._id
      : (await findOrCreateDefaultAccount(userId, input.assetType, input.costCurrency))._id;
    const holding: Holding = {
      _id: idGenerator('holding'),
      userId,
      accountId,
      assetType: input.assetType,
      symbol: instrument.symbol,
      name: instrument.name,
      market: instrument.market ?? input.market,
      quantity: input.quantity,
      costAmount: input.costAmount,
      costCurrency: input.costCurrency,
      source: input.source,
      active: input.active ?? true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return repo.set('holdings', holding);
  }

  async function deleteHolding(input: DeleteHoldingInput, ctx: BackendContext): Promise<Holding> {
    const userId = requireUser(ctx);
    const holding = await ownedHolding(input.holdingId, userId);
    return repo.patch('holdings', holding._id, { active: false, updatedAt: nowIso() });
  }

  async function listCashflows(input: ListCashflowsInput, ctx: BackendContext) {
    const userId = requireUser(ctx);
    const items = (await repo.list('cashflows', { userId }))
      .filter((cashflow) => input.includeDeleted || cashflow.status !== 'CANCELLED')
      .filter((cashflow) => !input.accountId || cashflow.accountId === input.accountId)
      .filter((cashflow) => !input.holdingId || cashflow.holdingId === input.holdingId)
      .filter((cashflow) => !input.fromDate || cashflow.tradeDate >= input.fromDate)
      .filter((cashflow) => !input.toDate || cashflow.tradeDate <= input.toDate)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.createdAt.localeCompare(b.createdAt));
    return { items };
  }

  async function upsertCashflow(input: UpsertCashflowInput, ctx: BackendContext): Promise<Cashflow> {
    const userId = requireUser(ctx);
    assertPositiveOrZero(input.amount, 'amount');
    assertNonEmpty(input.currency, 'currency');
    const holding = input.holdingId ? await ownedHolding(input.holdingId, userId) : undefined;
    const accountId = input.accountId
      ? (await ownedAccount(input.accountId, userId))._id
      : holding?.accountId ?? (await findOrCreateDefaultAccount(userId, 'CASH', input.currency))._id;
    const timestamp = nowIso();

    if (input._id) {
      const existing = await ownedCashflow(input._id, userId);
      const updated: Cashflow = {
        ...existing,
        accountId,
        holdingId: input.holdingId,
        planId: input.planId,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        quantity: input.quantity,
        confirmedPrice: input.confirmedPrice,
        feeAmount: input.feeAmount,
        tradeDate: input.tradeDate,
        note: input.note,
        source: input.source,
        status: input.status ?? existing.status,
        updatedAt: timestamp
      };
      return repo.set('cashflows', updated);
    }

    const cashflow: Cashflow = {
      _id: idGenerator('cashflow'),
      userId,
      accountId,
      holdingId: input.holdingId,
      planId: input.planId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      quantity: input.quantity,
      confirmedPrice: input.confirmedPrice,
      feeAmount: input.feeAmount,
      tradeDate: input.tradeDate,
      note: input.note,
      source: input.source,
      status: input.status ?? 'CONFIRMED',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return repo.set('cashflows', cashflow);
  }

  async function deleteCashflow(input: DeleteCashflowInput, ctx: BackendContext): Promise<Cashflow> {
    const userId = requireUser(ctx);
    const cashflow = await ownedCashflow(input.cashflowId, userId);
    return repo.patch('cashflows', cashflow._id, { status: 'CANCELLED', updatedAt: nowIso() });
  }

  async function listInvestmentPlans(input: ListInvestmentPlansInput, ctx: BackendContext) {
    const userId = requireUser(ctx);
    const items = (await repo.list('investment_plans', { userId }))
      .filter((plan) => input.includeEnded || plan.status !== 'ENDED')
      .filter((plan) => !input.holdingId || plan.holdingId === input.holdingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items };
  }

  async function upsertInvestmentPlan(input: UpsertInvestmentPlanInput, ctx: BackendContext): Promise<InvestmentPlan> {
    const userId = requireUser(ctx);
    assertCondition(input.currency === 'CNY', 'INVALID_PLAN_CURRENCY', 'MVP investment plans only support CNY', 422);
    assertPositive(input.amountPerPeriod, 'amountPerPeriod');
    const holding = await ownedHolding(input.holdingId, userId);
    assertCondition(holding.active, 'INVALID_PLAN_HOLDING', 'Investment plan holding must be active', 422);
    assertCondition(holding.assetType === 'FUND', 'INVALID_PLAN_HOLDING', 'Investment plans can only be attached to fund holdings', 422);
    const accountId = input.accountId
      ? (await ownedAccount(input.accountId, userId))._id
      : holding.accountId;
    const timestamp = nowIso();
    const nextRunDate = input.status === 'ACTIVE'
      ? (input.nextRunDate ?? nextRunForPlan(input, today()))
      : input.nextRunDate ?? null;

    if (input._id) {
      const existing = await ownedPlan(input._id, userId);
      const updated: InvestmentPlan = {
        ...existing,
        accountId,
        holdingId: input.holdingId,
        assetType: 'FUND',
        symbol: holding.symbol,
        name: input.name,
        amountPerPeriod: input.amountPerPeriod,
        currency: input.currency,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek,
        dayOfMonth: input.dayOfMonth,
        startDate: input.startDate,
        endDate: input.endDate,
        feeRate: input.feeRate,
        nextRunDate,
        nonTradingDayRule: input.nonTradingDayRule ?? 'NEXT_TRADING_DAY',
        status: input.status,
        note: input.note,
        updatedAt: timestamp
      };
      return repo.set('investment_plans', updated);
    }

    const plan: InvestmentPlan = {
      _id: idGenerator('plan'),
      userId,
      accountId,
      holdingId: input.holdingId,
      assetType: 'FUND',
      symbol: holding.symbol,
      name: input.name,
      amountPerPeriod: input.amountPerPeriod,
      currency: input.currency,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      endDate: input.endDate,
      feeRate: input.feeRate,
      nextRunDate,
      nonTradingDayRule: input.nonTradingDayRule ?? 'NEXT_TRADING_DAY',
      status: input.status,
      note: input.note,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return repo.set('investment_plans', plan);
  }

  async function deleteInvestmentPlan(input: DeleteInvestmentPlanInput, ctx: BackendContext): Promise<InvestmentPlan> {
    const userId = requireUser(ctx);
    const plan = await ownedPlan(input.planId, userId);
    return repo.patch('investment_plans', plan._id, { status: 'ENDED', nextRunDate: null, updatedAt: nowIso() });
  }

  async function executeInvestmentPlans(input: { date?: string; userId?: string }, ctx: BackendContext) {
    const userId = targetUser(input.userId, ctx);
    return executeDueInvestmentPlans({
      repo,
      userId,
      date: input.date ?? today(),
      now: nowIso()
    });
  }

  async function generateDailySnapshot(input: GenerateDailySnapshotInput, ctx: BackendContext) {
    const userId = targetUser(input.userId, ctx);
    assertCondition(userId, 'UNAUTHENTICATED', 'userId is required to generate snapshots', 401);
    return generateSnapshot({
      repo,
      userId,
      date: input.date ?? today(),
      now: nowIso(),
      generatedBy: input.generatedBy ?? 'MANUAL'
    });
  }

  async function getDashboard(input: DashboardInput, ctx: BackendContext) {
    const user = await findOrCreateUser(ctx);
    return buildDashboard(repo, user, input.range ?? '7D', today(), input.scope ?? 'PERSONAL');
  }

  async function syncPrices(input: SyncPricesInput, ctx: BackendContext): Promise<SyncPricesOutput> {
    const userId = requireUser(ctx);
    const date = input.date ?? today();
    const holdings = (await repo.list('holdings', { userId })).filter((holding) => holding.active);
    const currencies = Array.from(new Set(['CNY', ...holdings.map((holding) => holding.costCurrency)]));
    const job = await startSyncJob({
      repo,
      idGenerator,
      userId,
      jobType: 'PRICE_SYNC',
      now: nowIso(),
      metadata: { requestedDate: date }
    });
    try {
      const result = input.prices?.length
        ? { prices: input.prices, failures: [] as MarketDataFailure[] }
        : await priceProvider.sync({
          ...input,
          userId,
          date,
          holdings,
          currencies,
          baseCurrency: 'CNY'
        });
      const rawPrices = result.prices;
      const failures = result.failures ?? [];
      const upsertedPriceIds: string[] = [];
      for (const raw of rawPrices) {
        const price: Price = {
          _id: priceId(raw.assetType, raw.symbol, raw.date),
          ...raw,
          createdAt: nowIso()
        };
        await repo.set('prices', price);
        upsertedPriceIds.push(price._id);
      }
      const sourceStatuses = buildMarketDataSourceStatuses(holdings, rawPrices, failures);
      const status = marketDataSyncStatus(upsertedPriceIds.length, failures.length);
      await finishSyncJob({
        repo,
        job,
        status,
        now: nowIso(),
        errorMessage: status === 'FAILED' ? failures.map((failure) => `${failure.symbol}: ${failure.reason}`).join('; ') : undefined,
        provider: failures[0]?.provider,
        metadata: {
          upsertedPriceIds,
          failures,
          sourceStatuses
        }
      });
      return { jobId: job._id, status, upsertedPriceIds, failures, sourceStatuses };
    } catch (error) {
      const apiError = normalizeError(error);
      await finishSyncJob({
        repo,
        job,
        status: 'FAILED',
        now: nowIso(),
        errorMessage: apiError.message,
        provider: apiError.provider
      });
      throw apiError;
    }
  }

  async function startIbkrAuth(input: { accountId: string }, ctx: BackendContext) {
    requireUser(ctx);
    return ibkrProvider.startAuth(input, ctx);
  }

  async function ibkrOAuthCallback(input: { code?: string; state?: string }, ctx: BackendContext) {
    return ibkrProvider.handleOAuthCallback(input, ctx);
  }

  async function syncIbkr(input: { accountId?: string }, ctx: BackendContext) {
    const userId = requireUser(ctx);
    const job = await startSyncJob({
      repo,
      idGenerator,
      userId,
      jobType: 'IBKR_SYNC',
      now: nowIso(),
      metadata: { accountId: input.accountId }
    });
    try {
      const result = await ibkrProvider.sync(input, ctx);
      await finishSyncJob({ repo, job, status: result.status, now: nowIso(), metadata: result.metadata });
      return { jobId: job._id, status: result.status };
    } catch (error) {
      const apiError = normalizeError(error);
      await finishSyncJob({
        repo,
        job,
        status: 'FAILED',
        now: nowIso(),
        errorMessage: apiError.message,
        provider: apiError.provider
      });
      throw apiError;
    }
  }

  async function exportData(input: ExportDataInput, ctx: BackendContext): Promise<ExportDataOutput> {
    const userId = requireUser(ctx);
    assertCondition(input.format === 'CSV', 'UNSUPPORTED_EXPORT_FORMAT', 'Only CSV export is supported in MVP', 422);
    const accounts = await repo.list('accounts', { userId });
    const accountNames = new Map(accounts.map((account) => [account._id, account.name]));
    const holdings = await repo.list('holdings', { userId });
    const cashflows = (await repo.list('cashflows', { userId })).filter((cashflow) => cashflow.status !== 'CANCELLED');
    const snapshots = await repo.list('daily_snapshots', { userId });

    // Remove internal keys before export
    const holdingsForExport = holdings.map((holding) => {
      const { _id, userId, accountId, ...cleanHolding } = holding;
      return {
        ...cleanHolding,
        accountName: accountNames.get(holding.accountId) ?? ''
      };
    });
    const cashflowsForExport = cashflows.map((cashflow) => {
      const { _id, userId, accountId, ...cleanCashflow } = cashflow;
      return cleanCashflow;
    });
    const snapshotsForExport = snapshots.map((snapshot) => {
      const { _id, userId, ...cleanSnapshot } = snapshot;
      return cleanSnapshot;
    });
    return {
      files: [
        { name: 'holdings.csv', contentType: 'text/csv', content: toCsv(holdingsForExport) },
        { name: 'cashflows.csv', contentType: 'text/csv', content: toCsv(cashflowsForExport) },
        { name: 'daily_snapshots.csv', contentType: 'text/csv', content: toCsv(snapshotsForExport) }
      ]
    };
  }

  async function findOrCreateUser(ctx: BackendContext): Promise<User> {
    const userId = ctx.userId ?? ctx.openid;
    assertCondition(userId, 'UNAUTHENTICATED', 'User session is required for login', 401);
    const existing = await repo.get('users', userId);
    if (existing) {
      const normalized = normalizeUser(existing, ctx.openid ?? existing.openid, nowIso());
      if (JSON.stringify(normalized) !== JSON.stringify(existing)) {
        return repo.set('users', normalized);
      }
      return existing;
    }
    const timestamp = nowIso();
    const user: User = {
      _id: userId,
      openid: ctx.openid ?? userId,
      nickname: 'Web 用户',
      avatarUrl: '',
      profileSource: 'DEFAULT',
      profileCompleted: false,
      onboardingCompleted: false,
      baseCurrency: 'CNY',
      valuationTime: '21:30',
      gainLossColorMode: 'INTERNATIONAL',
      currentFamilyId: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return repo.set('users', user);
  }

  async function ownedAccount(accountId: string, userId: string): Promise<Account> {
    const account = await repo.get('accounts', accountId);
    if (!account) {
      throw notFound('account', accountId);
    }
    if (account.userId !== userId) {
      throw forbidden();
    }
    return account;
  }

  async function findOrCreateDefaultAccount(userId: string, assetType: Holding['assetType'], currency: string): Promise<Account> {
    const defaults = defaultAccountFor(assetType, currency);
    const accounts = await repo.list('accounts', { userId });
    const existing = accounts.find((account) =>
      account.active &&
      account.note === 'SYSTEM_DEFAULT' &&
      account.type === defaults.type &&
      account.name === defaults.name &&
      account.currency === defaults.currency
    ) ?? accounts.find((account) =>
      account.active &&
      account.type === defaults.type &&
      account.name === defaults.name &&
      account.currency === defaults.currency
    );
    if (existing) {
      return existing;
    }
    const timestamp = nowIso();
    return repo.set('accounts', {
      _id: idGenerator('account'),
      userId,
      type: defaults.type,
      name: defaults.name,
      currency: defaults.currency,
      active: true,
      note: 'SYSTEM_DEFAULT',
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async function ownedHolding(holdingId: string, userId: string): Promise<Holding> {
    const holding = await repo.get('holdings', holdingId);
    if (!holding) {
      throw notFound('holding', holdingId);
    }
    if (holding.userId !== userId) {
      throw forbidden();
    }
    return holding;
  }

  async function ownedCashflow(cashflowId: string, userId: string): Promise<Cashflow> {
    const cashflow = await repo.get('cashflows', cashflowId);
    if (!cashflow) {
      throw notFound('cashflow', cashflowId);
    }
    if (cashflow.userId !== userId) {
      throw forbidden();
    }
    return cashflow;
  }

  async function ownedPlan(planId: string, userId: string): Promise<InvestmentPlan> {
    const plan = await repo.get('investment_plans', planId);
    if (!plan) {
      throw notFound('investment plan', planId);
    }
    if (plan.userId !== userId) {
      throw forbidden();
    }
    return plan;
  }

  return {
    userLogin,
    updateUserProfile,
    updateUserSettings,
    completeOnboarding,
    getDashboard,
    listAccounts,
    upsertAccount,
    deleteAccount,
    searchInstruments,
    listHoldings,
    upsertHolding,
    deleteHolding,
    listCashflows,
    upsertCashflow,
    deleteCashflow,
    listInvestmentPlans,
    upsertInvestmentPlan,
    deleteInvestmentPlan,
    executeInvestmentPlans,
    startIbkrAuth,
    ibkrOAuthCallback,
    syncIbkr,
    syncPrices,
    generateDailySnapshot,
    exportData
  };
}

function marketSearchOptions(): { alphaVantageApiKey?: string; timeoutMs?: number; externalSearch?: boolean; instrumentTokenSecret?: string } {
  return {
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
    timeoutMs: Number(process.env.MARKET_DATA_TIMEOUT_MS) || 5000,
    externalSearch: process.env.NODE_ENV !== 'test',
    instrumentTokenSecret: process.env.INSTRUMENT_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? 'local-instrument-token-secret'
  };
}

function requireInstrumentToken(): boolean {
  if (process.env.REQUIRE_INSTRUMENT_TOKEN === 'true') {
    return true;
  }
  if (process.env.REQUIRE_INSTRUMENT_TOKEN === 'false') {
    return false;
  }
  return process.env.NODE_ENV !== 'test';
}

function userLoginOutput(user: User): UserLoginOutput {
  return {
    userId: user._id,
    baseCurrency: user.baseCurrency,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    profileCompleted: user.profileCompleted,
    onboardingCompleted: user.onboardingCompleted,
    gainLossColorMode: user.gainLossColorMode,
    currentFamilyId: user.currentFamilyId
  };
}

function normalizeUser(user: User, openid: string, now: string): User {
  const legacy = user as User & { displayName?: string };
  return {
    _id: user._id,
    openid: user.openid || openid,
    nickname: user.nickname || legacy.displayName || 'Web 用户',
    avatarUrl: user.avatarUrl || '',
    profileSource: user.profileSource || 'DEFAULT',
    profileCompleted: user.profileCompleted ?? false,
    onboardingCompleted: user.onboardingCompleted ?? false,
    baseCurrency: 'CNY',
    valuationTime: user.valuationTime || '21:30',
    gainLossColorMode: user.gainLossColorMode || 'INTERNATIONAL',
    currentFamilyId: user.currentFamilyId ?? null,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now
  };
}

function requireUser(ctx: BackendContext): string {
  const userId = ctx.userId ?? ctx.openid;
  assertCondition(userId, 'UNAUTHENTICATED', 'Authenticated userId is required', 401);
  return userId;
}

function targetUser(inputUserId: string | undefined, ctx: BackendContext): string | undefined {
  if (ctx.isAdmin && inputUserId) {
    return inputUserId;
  }
  return ctx.userId ?? ctx.openid ?? inputUserId;
}

function defaultAccountFor(assetType: Holding['assetType'], currency: string): Pick<Account, 'type' | 'name' | 'currency'> {
  const normalizedCurrency = currency.trim() || 'CNY';
  if (assetType === 'FUND') {
    return { type: 'ALIPAY_FUND', name: '默认基金账户', currency: 'CNY' };
  }
  if (assetType === 'GOLD') {
    return { type: 'CCB_GOLD', name: '默认黄金账户', currency: 'CNY' };
  }
  if (assetType === 'STOCK') {
    return { type: 'STOCK', name: '默认股票账户', currency: normalizedCurrency || 'USD' };
  }
  if (assetType === 'CASH') {
    return { type: 'CASH', name: '默认现金账户', currency: normalizedCurrency };
  }
  return { type: 'MANUAL', name: '默认资产账户', currency: normalizedCurrency };
}

function assertProfileSource(value: ProfileSource): void {
  assertCondition(value === 'WECHAT' || value === 'MANUAL' || value === 'DEFAULT', 'INVALID_PROFILE_SOURCE', 'Invalid profile source', 422);
}

function assertNonEmpty(value: unknown, field: string): void {
  assertCondition(typeof value === 'string' && value.trim().length > 0, 'INVALID_INPUT', `${field} is required`, 422);
}

function assertPositive(value: number, field: string): void {
  assertCondition(Number.isFinite(value) && value > 0, 'INVALID_INPUT', `${field} must be positive`, 422);
}

function assertPositiveOrZero(value: number, field: string): void {
  assertCondition(Number.isFinite(value) && value >= 0, 'INVALID_INPUT', `${field} must be zero or positive`, 422);
}

function priceId(assetType: Price['assetType'], symbol: string, date: string): string {
  return `${assetType}_${symbol}_${date}`;
}

async function latestHoldingPrice(repo: Repository, holding: Holding, date: string): Promise<Omit<Price, '_id' | 'createdAt'> | undefined> {
  if (holding.assetType === 'CASH') {
    return {
      assetType: 'CASH',
      symbol: holding.symbol,
      date,
      price: 1,
      currency: holding.costCurrency,
      source: 'SYSTEM',
      priceStale: false
    };
  }
  const candidates = new Set(priceSymbolCandidates(holding.assetType, holding.symbol));
  const prices = (await repo.list('prices', (price) => price.assetType === holding.assetType && candidates.has(price.symbol) && price.date <= date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const price = prices[0];
  if (!price) {
    return undefined;
  }
  const { _id, createdAt, ...latestPrice } = price;
  void _id;
  void createdAt;
  return latestPrice;
}

function marketDataSyncStatus(upsertedCount: number, failureCount: number): SyncJobStatus {
  if (upsertedCount > 0 && failureCount > 0) {
    return 'PARTIAL';
  }
  if (failureCount > 0) {
    return 'FAILED';
  }
  if (upsertedCount > 0) {
    return 'SUCCESS';
  }
  return 'SKIPPED';
}

function buildMarketDataSourceStatuses(
  holdings: Holding[],
  prices: Array<Omit<Price, '_id' | 'createdAt'>>,
  failures: MarketDataFailure[]
): MarketDataSourceStatus[] {
  const keys: MarketDataSourceKey[] = ['FUND', 'CN_STOCK', 'US_STOCK', 'GOLD', 'FX'];
  const requested = requestedMarketDataSources(holdings);
  const buckets = new Map<MarketDataSourceKey, { upserted: number; failures: number }>();
  for (const key of keys) {
    buckets.set(key, { upserted: 0, failures: 0 });
  }
  for (const price of prices) {
    const key = marketDataSourceForPrice(price);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.upserted += 1;
      requested.add(key);
    }
  }
  for (const failure of failures) {
    const bucket = buckets.get(failure.category);
    if (bucket) {
      bucket.failures += 1;
      requested.add(failure.category);
    }
  }

  return keys
    .filter((key) => requested.has(key) || (buckets.get(key)?.upserted ?? 0) > 0 || (buckets.get(key)?.failures ?? 0) > 0)
    .map((key) => {
      const bucket = buckets.get(key) ?? { upserted: 0, failures: 0 };
      const status = marketDataSyncStatus(bucket.upserted, bucket.failures) as MarketDataSourceStatus['status'];
      return {
        key,
        label: marketDataLabel(key),
        status,
        upserted: bucket.upserted,
        failures: bucket.failures,
        message: marketDataStatusMessage(status, bucket.upserted, bucket.failures)
      };
    });
}

function requestedMarketDataSources(holdings: Holding[]): Set<MarketDataSourceKey> {
  const sources = new Set<MarketDataSourceKey>();
  for (const holding of holdings) {
    if (holding.assetType === 'FUND') {
      sources.add('FUND');
    }
    if (holding.assetType === 'GOLD') {
      sources.add('GOLD');
      sources.add('FX');
    }
    if (holding.assetType === 'STOCK') {
      if (isCnStockHolding(holding)) {
        sources.add('CN_STOCK');
      } else {
        sources.add('US_STOCK');
        sources.add('FX');
      }
    }
    if (String(holding.costCurrency).toUpperCase() !== 'CNY') {
      sources.add('FX');
    }
  }
  return sources;
}

function marketDataSourceForPrice(price: Omit<Price, '_id' | 'createdAt'>): MarketDataSourceKey {
  if (price.assetType === 'FUND') {
    return 'FUND';
  }
  if (price.assetType === 'GOLD') {
    return 'GOLD';
  }
  if (price.assetType === 'FX') {
    return 'FX';
  }
  if (price.assetType === 'STOCK' && (price.currency === 'CNY' || isCnStockSymbol(price.symbol))) {
    return 'CN_STOCK';
  }
  return 'US_STOCK';
}

function isCnStockHolding(holding: Holding): boolean {
  return String(holding.market ?? '').toUpperCase() === 'CN' || isCnStockSymbol(holding.symbol);
}

function isCnStockSymbol(symbol: string): boolean {
  return /^(\d{6}|\d{6}\.(SH|SZ)|SH\d{6}|SZ\d{6})$/i.test(symbol.trim());
}

function marketDataLabel(key: MarketDataSourceKey): string {
  const labels: Record<MarketDataSourceKey, string> = {
    FUND: '基金净值',
    CN_STOCK: '中国股票',
    US_STOCK: '美国股票',
    GOLD: '黄金价格',
    FX: '汇率',
    MANUAL: '手动价格'
  };
  return labels[key];
}

function marketDataStatusMessage(status: MarketDataSourceStatus['status'], upserted: number, failures: number): string {
  if (status === 'SUCCESS') {
    return `已写入 ${upserted} 条价格`;
  }
  if (status === 'PARTIAL') {
    return `已写入 ${upserted} 条价格，${failures} 个请求失败`;
  }
  if (status === 'FAILED') {
    return `${failures} 个请求失败，需使用旧价格或手动补录`;
  }
  return '暂无需要同步的数据';
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof Error) {
    return new ApiError('INTERNAL_ERROR', error.message, { status: 500 });
  }
  return new ApiError('INTERNAL_ERROR', 'Unknown internal error', { status: 500 });
}
