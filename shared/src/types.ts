export type Currency = 'CNY' | 'USD' | 'HKD' | 'AUD' | string;

export type AccountType = 'ALIPAY_FUND' | 'CCB_GOLD' | 'STOCK' | 'CASH' | 'IBKR' | 'CUSTOM' | 'MANUAL';
export type AssetType = 'FUND' | 'GOLD' | 'STOCK' | 'CASH';
export type PriceAssetType = AssetType | 'FX';
export type DataSource = 'MANUAL' | 'IBKR' | 'PLAN';
export type Market = 'CN' | 'US' | 'HK' | 'GLOBAL' | string;
export type LegacyRange = '7D' | '30D' | '90D' | 'YTD';
export type WebRange = '1W' | '1M' | '6M' | '1Y';
export type Range = LegacyRange | WebRange | 'ALL';

export type ProfileSource = 'WECHAT' | 'MANUAL' | 'DEFAULT';
export type GainLossColorMode = 'INTERNATIONAL' | 'CHINA_MARKET';

export type CashflowType =
  | 'BUY'
  | 'SELL'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'DIVIDEND'
  | 'FEE'
  | 'TAX'
  | 'FX_CONVERT'
  | 'ADJUST';

export type PlanFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type PlanStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';
export type NonTradingDayRule = 'NEXT_TRADING_DAY';
export type CashflowStatus = 'PENDING' | 'CONFIRMED' | 'SKIPPED' | 'USER_ADJUSTED' | 'CANCELLED';
export type SyncJobType = 'PRICE_SYNC' | 'FX_SYNC' | 'PLAN_EXECUTION' | 'IBKR_SYNC' | 'DAILY_SNAPSHOT';
export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'SKIPPED';
export type SnapshotPriceStatus = 'OK' | 'PARTIAL' | 'STALE';
export type DataCompleteness = 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE';
export type DashboardScope = 'PERSONAL' | 'FAMILY';
export type MarketDataSourceKey = 'FUND' | 'CN_STOCK' | 'US_STOCK' | 'GOLD' | 'FX' | 'MANUAL';

export interface BackendContext {
  userId?: string;
  openid?: string;
  isAdmin?: boolean;
  raw?: unknown;
}

export interface User {
  _id: string;
  openid: string;
  nickname: string;
  avatarUrl: string;
  profileSource: ProfileSource;
  profileCompleted: boolean;
  onboardingCompleted: boolean;
  baseCurrency: 'CNY';
  valuationTime: string;
  gainLossColorMode: GainLossColorMode;
  currentFamilyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  _id: string;
  userId: string;
  type: AccountType;
  name: string;
  currency: Currency;
  active: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  _id: string;
  userId: string;
  accountId: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  market?: Market;
  quantity: number;
  costAmount: number;
  costCurrency: Currency;
  source: DataSource;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Cashflow {
  _id: string;
  userId: string;
  accountId: string;
  holdingId?: string;
  planId?: string | null;
  type: CashflowType;
  amount: number;
  currency: Currency;
  quantity?: number;
  confirmedPrice?: number;
  feeAmount?: number;
  tradeDate: string;
  note?: string;
  source: DataSource;
  status: CashflowStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentPlan {
  _id: string;
  userId: string;
  accountId: string;
  holdingId: string;
  assetType: 'FUND';
  symbol: string;
  name: string;
  amountPerPeriod: number;
  currency: 'CNY';
  frequency: PlanFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string | null;
  feeRate?: number;
  nextRunDate?: string | null;
  nonTradingDayRule: NonTradingDayRule;
  status: PlanStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Price {
  _id: string;
  assetType: PriceAssetType;
  symbol: string;
  date: string;
  price: number;
  currency: Currency;
  source: string;
  priceStale: boolean;
  createdAt: string;
}

export type LatestPrice = Omit<Price, '_id' | 'createdAt'>;

export type HoldingWithLatestPrice = Holding & {
  latestPrice?: LatestPrice;
};

export interface FxRateUsed {
  rate: number;
  date: string;
  stale: boolean;
}

export interface DailySnapshot {
  _id: string;
  userId: string;
  date: string;
  baseCurrency: 'CNY';
  totalValue: number;
  totalValueOriginal: Array<{ currency: Currency; amount: number }>;
  fxRatesUsed: Record<string, FxRateUsed>;
  fxStale: boolean;
  investedPrincipal: number;
  netInflow: number;
  dailyInvestmentProfit: number;
  dailyInvestmentReturn: number;
  cumulativeInvestmentProfit: number;
  cumulativeInvestmentReturn: number;
  breakdown: {
    fund: number;
    gold: number;
    stock: number;
    cash: number;
  };
  priceStatus: SnapshotPriceStatus;
  dataCompleteness: DataCompleteness;
  trustNotes: string[];
  generatedBy: 'SCHEDULED' | 'MANUAL';
  generatedAt: string;
  updatedAt: string;
}

export interface SyncJob {
  _id: string;
  userId: string;
  jobType: SyncJobType;
  status: SyncJobStatus;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  provider?: string;
  metadata: Record<string, unknown>;
}

export interface MarketDataFailure {
  category: MarketDataSourceKey;
  assetType: PriceAssetType;
  symbol: string;
  provider: string;
  reason: string;
  market?: Market;
}

export interface MarketDataSourceStatus {
  key: MarketDataSourceKey;
  label: string;
  status: Extract<SyncJobStatus, 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'SKIPPED'>;
  upserted: number;
  failures: number;
  message: string;
}

export interface OAuthToken {
  _id: string;
  userId: string;
  provider: 'IBKR';
  accountId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionMap {
  users: User;
  accounts: Account;
  holdings: Holding;
  cashflows: Cashflow;
  investment_plans: InvestmentPlan;
  prices: Price;
  daily_snapshots: DailySnapshot;
  sync_jobs: SyncJob;
  oauth_tokens: OAuthToken;
}

export type CollectionName = keyof CollectionMap;
export type CollectionDoc<C extends CollectionName> = CollectionMap[C];

export interface UserLoginInput {}
export type UserLoginOutput = Pick<
  User,
  'baseCurrency' | 'nickname' | 'avatarUrl' | 'profileCompleted' | 'onboardingCompleted' | 'gainLossColorMode' | 'currentFamilyId'
> & {
  userId: string;
};

export interface UpdateUserProfileInput {
  nickname: string;
  avatarUrl?: string;
  profileSource?: ProfileSource;
}

export type UpdateUserSettingsInput = Partial<Pick<User, 'valuationTime' | 'gainLossColorMode'>>;
export interface CompleteOnboardingInput {}

export type UpsertAccountInput = Partial<Pick<Account, '_id' | 'note' | 'active'>> &
  Pick<Account, 'type' | 'name' | 'currency'>;

export interface ListAccountsInput {
  includeDisabled?: boolean;
}

export interface DeleteAccountInput {
  accountId: string;
}

export type UpsertHoldingInput = Partial<Pick<Holding, '_id' | 'accountId' | 'market' | 'active'>> &
  Pick<Holding, 'assetType' | 'symbol' | 'name' | 'quantity' | 'costAmount' | 'costCurrency' | 'source'> & {
    instrumentToken?: string;
  };

export interface ListHoldingsInput {
  includeArchived?: boolean;
  accountId?: string;
  assetType?: AssetType;
}

export interface ListHoldingsOutput {
  items: HoldingWithLatestPrice[];
}

export interface InstrumentSearchInput {
  query: string;
  assetType?: AssetType;
}

export interface InstrumentSearchResult {
  assetType: AssetType;
  symbol: string;
  name: string;
  market?: Market;
  currency: Currency;
  source: string;
  token?: string;
}

export interface InstrumentSearchOutput {
  items: InstrumentSearchResult[];
}

export interface DeleteHoldingInput {
  holdingId: string;
}

export type UpsertCashflowInput = Partial<Pick<Cashflow, '_id' | 'accountId' | 'holdingId' | 'planId' | 'quantity' | 'confirmedPrice' | 'feeAmount' | 'note' | 'status'>> &
  Pick<Cashflow, 'type' | 'amount' | 'currency' | 'tradeDate' | 'source'>;

export interface ListCashflowsInput {
  accountId?: string;
  holdingId?: string;
  fromDate?: string;
  toDate?: string;
  includeDeleted?: boolean;
}

export interface DeleteCashflowInput {
  cashflowId: string;
}

export type UpsertInvestmentPlanInput = Partial<Pick<InvestmentPlan, '_id' | 'accountId' | 'dayOfWeek' | 'dayOfMonth' | 'endDate' | 'feeRate' | 'nextRunDate' | 'note' | 'nonTradingDayRule'>> &
  Pick<InvestmentPlan, 'holdingId' | 'name' | 'amountPerPeriod' | 'currency' | 'frequency' | 'startDate' | 'status'>;

export interface ListInvestmentPlansInput {
  includeEnded?: boolean;
  holdingId?: string;
}

export interface DeleteInvestmentPlanInput {
  planId: string;
}

export interface ExecuteInvestmentPlansInput {
  date?: string;
  userId?: string;
}

export interface ExecuteInvestmentPlansOutput {
  date: string;
  createdCashflowIds: string[];
  confirmedCashflowIds: string[];
  skippedPlanIds: string[];
}

export interface GenerateDailySnapshotInput {
  date?: string;
  generatedBy?: 'SCHEDULED' | 'MANUAL';
  userId?: string;
}

export interface DashboardInput {
  range?: Range;
  scope?: DashboardScope;
  familyId?: string;
}

export interface DashboardOutput {
  scope: DashboardScope;
  profile: Pick<User, 'nickname' | 'avatarUrl' | 'profileCompleted' | 'onboardingCompleted' | 'gainLossColorMode'>;
  members: Array<{ userId: string; nickname: string; avatarUrl: string }>;
  summary: {
    totalValue: number;
    investedPrincipal: number;
    dailyInvestmentProfit: number;
    dailyInvestmentReturn: number;
    cumulativeInvestmentProfit: number;
    cumulativeInvestmentReturn: number;
    snapshotTime: string | null;
    dataCompleteness: DataCompleteness;
    priceStatus: SnapshotPriceStatus;
    fxStale: boolean;
    trustNotes: string[];
  };
  breakdown: DailySnapshot['breakdown'];
  series: Array<{
    date: string;
    totalValue: number;
    investedPrincipal: number;
    dailyInvestmentProfit: number;
    dailyInvestmentReturn: number;
    cumulativeInvestmentProfit: number;
    cumulativeInvestmentReturn: number;
    breakdown: DailySnapshot['breakdown'];
    priceStatus: SnapshotPriceStatus;
    fxStale: boolean;
    dataCompleteness: DataCompleteness;
    trustNotes: string[];
  }>;
}

export interface SyncPricesInput {
  prices?: Array<Omit<Price, '_id' | 'createdAt'>>;
  date?: string;
  force?: boolean;
}

export interface SyncPricesOutput {
  jobId: string;
  status: SyncJobStatus;
  upsertedPriceIds: string[];
  failures: MarketDataFailure[];
  sourceStatuses: MarketDataSourceStatus[];
}

export interface StartIbkrAuthInput {
  accountId: string;
}

export interface IbkrOAuthCallbackInput {
  code?: string;
  state?: string;
}

export interface SyncIbkrInput {
  accountId?: string;
}

export interface ExportDataInput {
  format: 'CSV';
}

export interface ExportDataOutput {
  files: Array<{
    name: string;
    contentType: 'text/csv';
    content: string;
  }>;
}

export type BackendHandlers = {
  userLogin(input: UserLoginInput, ctx: BackendContext): Promise<UserLoginOutput>;
  updateUserProfile(input: UpdateUserProfileInput, ctx: BackendContext): Promise<User>;
  updateUserSettings(input: UpdateUserSettingsInput, ctx: BackendContext): Promise<User>;
  completeOnboarding(input: CompleteOnboardingInput, ctx: BackendContext): Promise<User>;
  getDashboard(input: DashboardInput, ctx: BackendContext): Promise<DashboardOutput>;
  listAccounts(input: ListAccountsInput, ctx: BackendContext): Promise<{ items: Account[] }>;
  upsertAccount(input: UpsertAccountInput, ctx: BackendContext): Promise<Account>;
  deleteAccount(input: DeleteAccountInput, ctx: BackendContext): Promise<Account>;
  searchInstruments(input: InstrumentSearchInput, ctx: BackendContext): Promise<InstrumentSearchOutput>;
  listHoldings(input: ListHoldingsInput, ctx: BackendContext): Promise<ListHoldingsOutput>;
  upsertHolding(input: UpsertHoldingInput, ctx: BackendContext): Promise<Holding>;
  deleteHolding(input: DeleteHoldingInput, ctx: BackendContext): Promise<Holding>;
  listCashflows(input: ListCashflowsInput, ctx: BackendContext): Promise<{ items: Cashflow[] }>;
  upsertCashflow(input: UpsertCashflowInput, ctx: BackendContext): Promise<Cashflow>;
  deleteCashflow(input: DeleteCashflowInput, ctx: BackendContext): Promise<Cashflow>;
  listInvestmentPlans(input: ListInvestmentPlansInput, ctx: BackendContext): Promise<{ items: InvestmentPlan[] }>;
  upsertInvestmentPlan(input: UpsertInvestmentPlanInput, ctx: BackendContext): Promise<InvestmentPlan>;
  deleteInvestmentPlan(input: DeleteInvestmentPlanInput, ctx: BackendContext): Promise<InvestmentPlan>;
  executeInvestmentPlans(input: ExecuteInvestmentPlansInput, ctx: BackendContext): Promise<ExecuteInvestmentPlansOutput>;
  startIbkrAuth(input: StartIbkrAuthInput, ctx: BackendContext): Promise<{ authUrl: string; state: string }>;
  ibkrOAuthCallback(input: IbkrOAuthCallbackInput, ctx: BackendContext): Promise<{ ok: true }>;
  syncIbkr(input: SyncIbkrInput, ctx: BackendContext): Promise<{ jobId: string; status: SyncJobStatus }>;
  syncPrices(input: SyncPricesInput, ctx: BackendContext): Promise<SyncPricesOutput>;
  generateDailySnapshot(input: GenerateDailySnapshotInput, ctx: BackendContext): Promise<DailySnapshot>;
  exportData(input: ExportDataInput, ctx: BackendContext): Promise<ExportDataOutput>;
};
