import { get as httpsGet } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type {
  Currency,
  Holding,
  Market,
  MarketDataFailure,
  MarketDataSourceKey,
  Price,
  PriceAssetType
} from '../types';
import type { MarketDataSyncRequest, MarketDataSyncResult, PriceProvider } from './prices';

export type MarketDataHttpGet = (url: string, options: { timeoutMs: number }) => Promise<string>;

export interface FreeMarketDataProviderConfig {
  alphaVantageApiKey?: string;
  timeoutMs?: number;
  mode?: string;
  httpGet?: MarketDataHttpGet;
}

const TROY_OUNCE_GRAMS = 31.1034768;

type RawPrice = Omit<Price, '_id' | 'createdAt'>;

export function createFreeMarketDataPriceProvider(config: FreeMarketDataProviderConfig = {}): PriceProvider {
  const env = runtimeEnv();
  const alphaVantageApiKey = config.alphaVantageApiKey ?? env.ALPHA_VANTAGE_API_KEY ?? '';
  const timeoutMs = config.timeoutMs ?? numberFromEnv(env.MARKET_DATA_TIMEOUT_MS, 8000);
  const marketDataMode = config.mode ?? env.MARKET_DATA_MODE ?? 'free';
  const httpGet = config.httpGet ?? defaultHttpGet;

  return {
    async sync(input: MarketDataSyncRequest): Promise<MarketDataSyncResult> {
      if (marketDataMode !== 'free') {
        return {
          prices: [],
          failures: [
            failure('MANUAL', 'FX', 'MARKET_DATA_MODE', 'MARKET_DATA', `Unsupported MARKET_DATA_MODE ${marketDataMode}; only free is supported`)
          ]
        };
      }

      const failures: MarketDataFailure[] = [];
      const prices = new Map<string, RawPrice>();
      const holdings = input.holdings.filter((holding) => holding.active);
      const fxRates = new Map<Currency, RawPrice>();

      const pushPrice = (price: RawPrice) => {
        prices.set(`${price.assetType}_${price.symbol}_${price.date}`, price);
      };
      const pushFailure = (failure: MarketDataFailure) => {
        failures.push(failure);
      };

      for (const currency of collectFxCurrencies(holdings, input.currencies)) {
        try {
          const fx = await fetchFxRate({
            currency,
            date: input.date,
            alphaVantageApiKey,
            timeoutMs,
            httpGet
          });
          pushPrice(fx);
          fxRates.set(currency, fx);
        } catch (error) {
          pushFailure(failure('FX', 'FX', `${currency}_CNY`, 'FRANKFURTER', reason(error)));
        }
      }

      for (const fund of uniqueBy(holdings.filter((holding) => holding.assetType === 'FUND'), (holding) => normalizeFundSymbol(holding.symbol))) {
        const symbol = normalizeFundSymbol(fund.symbol);
        try {
          pushPrice(await fetchFundNav({ symbol, date: input.date, timeoutMs, httpGet }));
        } catch (error) {
          pushFailure(failure('FUND', 'FUND', symbol, 'EASTMONEY_PUBLIC', reason(error), fund.market));
        }
      }

      for (const stock of uniqueBy(holdings.filter((holding) => holding.assetType === 'STOCK'), stockKey)) {
        const market = classifyStockMarket(stock);
        if (market === 'CN') {
          const normalized = normalizeCnStockSymbol(stock.symbol);
          try {
            pushPrice(await fetchCnStockPrice({ symbol: normalized.symbol, secid: normalized.secid, date: input.date, timeoutMs, httpGet }));
          } catch (error) {
            pushFailure(failure('CN_STOCK', 'STOCK', normalized.symbol, 'EASTMONEY_PUBLIC', reason(error), stock.market));
          }
          continue;
        }
        if (market === 'US') {
          const symbol = normalizeUsStockSymbol(stock.symbol);
          if (!alphaVantageApiKey) {
            pushFailure(failure('US_STOCK', 'STOCK', symbol, 'ALPHA_VANTAGE', 'ALPHA_VANTAGE_API_KEY is not configured', stock.market));
            continue;
          }
          try {
            pushPrice(await fetchUsStockPrice({ symbol, date: input.date, apiKey: alphaVantageApiKey, timeoutMs, httpGet }));
          } catch (error) {
            pushFailure(failure('US_STOCK', 'STOCK', symbol, 'ALPHA_VANTAGE', reason(error), stock.market));
          }
          continue;
        }
        pushFailure(failure('US_STOCK', 'STOCK', stock.symbol, 'MARKET_DATA', 'Only CN and US stocks are supported in the free market data mode', stock.market));
      }

      for (const gold of uniqueBy(holdings.filter((holding) => holding.assetType === 'GOLD'), (holding) => normalizeGoldSymbol(holding.symbol))) {
        const symbol = normalizeGoldSymbol(gold.symbol);
        const usdCny = fxRates.get('USD');
        if (!usdCny) {
          pushFailure(failure('GOLD', 'GOLD', symbol, 'ALPHA_VANTAGE', 'USD_CNY rate is unavailable for gold conversion', gold.market));
          continue;
        }
        try {
          pushPrice(await fetchGoldPrice({
            symbol,
            date: input.date,
            usdCny,
            apiKey: alphaVantageApiKey,
            timeoutMs,
            httpGet
          }));
        } catch (error) {
          pushFailure(failure('GOLD', 'GOLD', symbol, 'ALPHA_VANTAGE', reason(error), gold.market));
        }
      }

      return {
        prices: Array.from(prices.values()),
        failures
      };
    }
  };
}

async function fetchFundNav(input: { symbol: string; date: string; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  const url = `https://fundgz.1234567.com.cn/js/${encodeURIComponent(input.symbol)}.js?rt=${Date.now()}`;
  const data = record(parseJsonLike(await input.httpGet(url, { timeoutMs: input.timeoutMs })));
  const price = finiteNumber(data.dwjz ?? data.gsz, 'fund NAV');
  const date = stringField(data.jzrq) ?? stringField(data.gztime)?.slice(0, 10) ?? input.date;
  return {
    assetType: 'FUND',
    symbol: input.symbol,
    date,
    price,
    currency: 'CNY',
    source: 'EASTMONEY_PUBLIC',
    priceStale: date !== input.date
  };
}

async function fetchCnStockPrice(input: { symbol: string; secid: string; date: string; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  const quoteCode = `${input.symbol.endsWith('.SH') ? 'sh' : 'sz'}${input.symbol.slice(0, 6)}`;
  const body = await input.httpGet(`https://qt.gtimg.cn/q=${quoteCode}`, { timeoutMs: input.timeoutMs });
  const quote = body.match(/="([^"]+)"/)?.[1]?.split('~') ?? [];
  const price = finiteNumber(quote[3], 'CN stock quote price');
  const refreshed = quote[30] && /^\d{14}$/.test(quote[30]) ? `${quote[30].slice(0, 4)}-${quote[30].slice(4, 6)}-${quote[30].slice(6, 8)}` : input.date;
  return {
    assetType: 'STOCK',
    symbol: input.symbol,
    date: refreshed,
    price,
    currency: 'CNY',
    source: 'TENCENT_PUBLIC',
    priceStale: refreshed !== input.date
  };
}

async function fetchUsStockPrice(input: { symbol: string; date: string; apiKey: string; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  const params = new URLSearchParams({
    function: 'GLOBAL_QUOTE',
    symbol: input.symbol,
    apikey: input.apiKey
  });
  const url = `https://www.alphavantage.co/query?${params.toString()}`;
  const data = record(parseJsonLike(await input.httpGet(url, { timeoutMs: input.timeoutMs })));
  const quote = record(data['Global Quote']);
  if (stringField(data.Note) || stringField(data.Information)) {
    throw new Error(stringField(data.Note) ?? stringField(data.Information));
  }
  const price = finiteNumber(quote['05. price'], 'US stock price');
  const date = stringField(quote['07. latest trading day']) ?? input.date;
  return {
    assetType: 'STOCK',
    symbol: input.symbol,
    date,
    price,
    currency: 'USD',
    source: 'ALPHA_VANTAGE',
    priceStale: date !== input.date
  };
}

async function fetchGoldPrice(input: { symbol: string; date: string; usdCny: RawPrice; apiKey: string; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  if (!input.apiKey) {
    return fetchYahooGoldPrice(input);
  }
  try {
    return await fetchAlphaGoldPrice(input);
  } catch (alphaError) {
    try {
      return await fetchYahooGoldPrice(input);
    } catch (fallbackError) {
      throw new Error(`${reason(alphaError)}; fallback failed: ${reason(fallbackError)}`);
    }
  }
}

async function fetchAlphaGoldPrice(input: { symbol: string; date: string; usdCny: RawPrice; apiKey: string; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  const params = new URLSearchParams({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: 'XAU',
    to_currency: 'USD',
    apikey: input.apiKey
  });
  const url = `https://www.alphavantage.co/query?${params.toString()}`;
  const data = record(parseJsonLike(await input.httpGet(url, { timeoutMs: input.timeoutMs })));
  const quote = record(data['Realtime Currency Exchange Rate']);
  if (stringField(data.Note) || stringField(data.Information)) {
    throw new Error(stringField(data.Note) ?? stringField(data.Information));
  }
  const xauUsdPerOunce = finiteNumber(quote['5. Exchange Rate'], 'XAU USD exchange rate');
  const refreshed = stringField(quote['6. Last Refreshed']);
  const date = refreshed?.slice(0, 10) || input.date;
  return {
    assetType: 'GOLD',
    symbol: input.symbol,
    date,
    price: (xauUsdPerOunce * input.usdCny.price) / TROY_OUNCE_GRAMS,
    currency: 'CNY',
    source: 'ALPHA_VANTAGE_XAU_FX',
    priceStale: date !== input.date || input.usdCny.priceStale
  };
}

async function fetchYahooGoldPrice(input: { symbol: string; date: string; usdCny: RawPrice; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d';
  const data = record(parseJsonLike(await input.httpGet(url, { timeoutMs: input.timeoutMs })));
  const chart = record(data.chart);
  const result = record(arrayField(chart.result)[0]);
  const timestamps = arrayField(result.timestamp);
  const quote = record(arrayField(record(result.indicators).quote)[0]);
  const closes = arrayField(quote.close);
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const close = Number(closes[index]);
    const timestamp = Number(timestamps[index]);
    if (Number.isFinite(close) && close > 0 && Number.isFinite(timestamp)) {
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      return {
        assetType: 'GOLD',
        symbol: input.symbol,
        date,
        price: (close * input.usdCny.price) / TROY_OUNCE_GRAMS,
        currency: 'CNY',
        source: 'YAHOO_FINANCE_GC_F_FALLBACK',
        priceStale: date !== input.date || input.usdCny.priceStale
      };
    }
  }
  throw new Error('Yahoo Finance gold fallback did not return a valid close');
}

async function fetchFxRate(input: { currency: Currency; date: string; alphaVantageApiKey: string; timeoutMs: number; httpGet: MarketDataHttpGet }): Promise<RawPrice> {
  const currency = normalizeCurrency(input.currency);
  if (currency === 'CNY') {
    return {
      assetType: 'FX',
      symbol: 'CNY_CNY',
      date: input.date,
      price: 1,
      currency: 'CNY',
      source: 'SYSTEM',
      priceStale: false
    };
  }

  try {
    const params = new URLSearchParams({ from: currency, to: 'CNY' });
    const url = `https://api.frankfurter.dev/v1/${encodeURIComponent(input.date)}?${params.toString()}`;
    const data = record(parseJsonLike(await input.httpGet(url, { timeoutMs: input.timeoutMs })));
    const rates = record(data.rates);
    const price = finiteNumber(rates.CNY, `${currency}_CNY rate`);
    const date = stringField(data.date) ?? input.date;
    return {
      assetType: 'FX',
      symbol: `${currency}_CNY`,
      date,
      price,
      currency: 'CNY',
      source: 'FRANKFURTER',
      priceStale: date !== input.date
    };
  } catch (frankfurterError) {
    if (!input.alphaVantageApiKey) {
      throw frankfurterError;
    }
    const params = new URLSearchParams({
      function: 'CURRENCY_EXCHANGE_RATE',
      from_currency: currency,
      to_currency: 'CNY',
      apikey: input.alphaVantageApiKey
    });
    const url = `https://www.alphavantage.co/query?${params.toString()}`;
    const data = record(parseJsonLike(await input.httpGet(url, { timeoutMs: input.timeoutMs })));
    const quote = record(data['Realtime Currency Exchange Rate']);
    const price = finiteNumber(quote['5. Exchange Rate'], `${currency}_CNY rate`);
    const refreshed = stringField(quote['6. Last Refreshed']);
    const date = refreshed?.slice(0, 10) || input.date;
    return {
      assetType: 'FX',
      symbol: `${currency}_CNY`,
      date,
      price,
      currency: 'CNY',
      source: 'ALPHA_VANTAGE',
      priceStale: date !== input.date
    };
  }
}

function collectFxCurrencies(holdings: Holding[], inputCurrencies: Currency[]): Currency[] {
  const currencies = new Set<Currency>();
  for (const currency of inputCurrencies) {
    if (normalizeCurrency(currency) !== 'CNY') {
      currencies.add(normalizeCurrency(currency));
    }
  }
  for (const holding of holdings) {
    if (normalizeCurrency(holding.costCurrency) !== 'CNY') {
      currencies.add(normalizeCurrency(holding.costCurrency));
    }
    if (holding.assetType === 'STOCK' && classifyStockMarket(holding) === 'US') {
      currencies.add('USD');
    }
    if (holding.assetType === 'GOLD') {
      currencies.add('USD');
    }
  }
  return Array.from(currencies).sort();
}

function classifyStockMarket(holding: Holding): 'CN' | 'US' | 'UNSUPPORTED' {
  const market = String(holding.market ?? '').toUpperCase();
  if (market === 'CN' || looksLikeCnStock(holding.symbol)) {
    return 'CN';
  }
  if (market === 'US' || /^[A-Z][A-Z0-9.-]{0,14}$/i.test(holding.symbol.trim())) {
    return 'US';
  }
  return 'UNSUPPORTED';
}

function stockKey(holding: Holding): string {
  const market = classifyStockMarket(holding);
  if (market === 'CN') {
    return normalizeCnStockSymbol(holding.symbol).symbol;
  }
  if (market === 'US') {
    return normalizeUsStockSymbol(holding.symbol);
  }
  return holding.symbol.trim().toUpperCase();
}

function normalizeFundSymbol(symbol: string): string {
  return symbol.trim();
}

function normalizeGoldSymbol(symbol: string): string {
  return symbol.trim().toUpperCase() || 'XAU_CNY_GRAM';
}

function normalizeUsStockSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeCnStockSymbol(symbol: string): { symbol: string; secid: string } {
  const raw = symbol.trim().toUpperCase().replace(/^SH/, '').replace(/^SZ/, '');
  const match = raw.match(/^(\d{6})(?:\.(SH|SZ))?$/);
  if (!match) {
    throw new Error(`Invalid CN stock symbol ${symbol}`);
  }
  const code = match[1];
  const exchange = match[2] ?? inferCnExchange(code);
  const secidPrefix = exchange === 'SH' ? '1' : '0';
  return {
    symbol: `${code}.${exchange}`,
    secid: `${secidPrefix}.${code}`
  };
}

function inferCnExchange(code: string): 'SH' | 'SZ' {
  return code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ';
}

function looksLikeCnStock(symbol: string): boolean {
  const raw = symbol.trim().toUpperCase();
  return /^(\d{6}|\d{6}\.(SH|SZ)|SH\d{6}|SZ\d{6})$/.test(raw);
}

function failure(category: MarketDataSourceKey, assetType: PriceAssetType, symbol: string, provider: string, failureReason: string, market?: Market): MarketDataFailure {
  return {
    category,
    assetType,
    symbol,
    provider,
    reason: failureReason,
    market
  };
}

function parseJsonLike(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Response is not JSON or JSONP');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown, field: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${field}`);
  }
  return number;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown market data error';
}

function normalizeCurrency(currency: Currency): Currency {
  return String(currency).trim().toUpperCase();
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (!seen.has(value)) {
      seen.add(value);
      result.push(item);
    }
  }
  return result;
}

function compactDate(date: string): string {
  return date.replace(/-/g, '');
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runtimeEnv(): Record<string, string | undefined> {
  if (typeof process === 'undefined') {
    return {};
  }
  return process.env as Record<string, string | undefined>;
}

function defaultHttpGet(url: string, options: { timeoutMs: number }): Promise<string> {
  return httpGetWithRedirect(url, options, 0);
}

function httpGetWithRedirect(url: string, options: { timeoutMs: number }, redirects: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 personal-asset-tracker',
        accept: 'application/json,text/plain,*/*'
      }
    }, (response: IncomingMessage) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const statusCode = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location && redirects < 3) {
          const nextUrl = new URL(response.headers.location, url).toString();
          httpGetWithRedirect(nextUrl, options, redirects + 1).then(resolve, reject);
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode}: ${body.slice(0, 120)}`));
          return;
        }
        resolve(body);
      });
    });
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error(`HTTP request timed out after ${options.timeoutMs}ms`));
    });
    request.on('error', reject);
  });
}
