import type { IncomingMessage } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { get as httpsGet } from 'node:https';
import type { AssetType, InstrumentSearchInput, InstrumentSearchOutput, InstrumentSearchResult } from '../types';

type HttpGet = (url: string, options: { timeoutMs: number }) => Promise<string>;

const BUILTIN_INSTRUMENTS: InstrumentSearchResult[] = [
  { assetType: 'STOCK', symbol: 'AAPL', name: 'Apple Inc.', market: 'US', currency: 'USD', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: 'MSFT', name: 'Microsoft Corporation', market: 'US', currency: 'USD', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'US', currency: 'USD', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'US', currency: 'USD', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: 'TSLA', name: 'Tesla Inc.', market: 'US', currency: 'USD', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: '600519.SH', name: '贵州茅台', market: 'CN', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: '000001.SZ', name: '平安银行', market: 'CN', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'STOCK', symbol: '300750.SZ', name: '宁德时代', market: 'CN', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'FUND', symbol: '000001', name: '华夏成长混合', market: 'CN', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'FUND', symbol: '000002', name: '华夏成长混合二号', market: 'CN', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'GOLD', symbol: 'XAU_CNY_GRAM', name: '国际金价 CNY/克', market: 'GLOBAL', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'GOLD', symbol: 'CCB_GOLD', name: '建行黄金积存', market: 'GLOBAL', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'CASH', symbol: 'CNY', name: '人民币现金', market: 'CN', currency: 'CNY', source: 'BUILTIN' },
  { assetType: 'CASH', symbol: 'USD', name: '美元现金', market: 'US', currency: 'USD', source: 'BUILTIN' }
];

export async function searchInstruments(input: InstrumentSearchInput, options: {
  alphaVantageApiKey?: string;
  timeoutMs?: number;
  httpGet?: HttpGet;
  externalSearch?: boolean;
  instrumentTokenSecret?: string;
} = {}): Promise<InstrumentSearchOutput> {
  const query = normalizeQuery(input.query);
  if (!query) {
    return { items: [] };
  }
  const assetType = input.assetType;
  const timeoutMs = options.timeoutMs ?? 5000;
  const httpGet = options.httpGet ?? defaultHttpGet;
  const items = new Map<string, InstrumentSearchResult>();

  for (const item of searchBuiltins(query, assetType)) {
    addResult(items, item);
  }
  if (Array.from(items.values()).some((item) => normalizeSymbol(item.symbol) === normalizeSymbol(query))) {
    return { items: withTokens(Array.from(items.values()).slice(0, 8), options.instrumentTokenSecret) };
  }

  if (options.externalSearch !== false && (!assetType || assetType === 'STOCK')) {
    await collectBestEffort(items, searchEastmoneyStocks(query, timeoutMs, httpGet));
    if (options.alphaVantageApiKey) {
      await collectBestEffort(items, searchAlphaStocks(query, options.alphaVantageApiKey, timeoutMs, httpGet));
    }
  }
  if (options.externalSearch !== false && (!assetType || assetType === 'FUND')) {
    await collectBestEffort(items, searchEastmoneyFunds(query, timeoutMs, httpGet));
  }

  return {
    items: withTokens(Array.from(items.values())
      .filter((item) => !assetType || item.assetType === assetType)
      .slice(0, 8), options.instrumentTokenSecret)
  };
}

export async function resolveInstrument(input: InstrumentSearchInput, options: {
  alphaVantageApiKey?: string;
  timeoutMs?: number;
  httpGet?: HttpGet;
  externalSearch?: boolean;
  instrumentTokenSecret?: string;
  instrumentToken?: string;
  requireInstrumentToken?: boolean;
} = {}): Promise<InstrumentSearchResult | undefined> {
  const query = normalizeSymbol(input.query);
  if (options.requireInstrumentToken) {
    const verified = verifyInstrumentToken(options.instrumentToken, options.instrumentTokenSecret);
    if (!verified || verified.assetType !== input.assetType || !symbolMatches(verified.symbol, query)) {
      return undefined;
    }
  }
  const result = await searchInstruments({ ...input, query }, options);
  return result.items.find((item) => symbolMatches(item.symbol, query) && (!input.assetType || item.assetType === input.assetType));
}

function withTokens(items: InstrumentSearchResult[], secret: string | undefined): InstrumentSearchResult[] {
  if (!secret) {
    return items;
  }
  return items.map((item) => ({
    ...item,
    token: signInstrumentToken(item, secret)
  }));
}

function signInstrumentToken(item: InstrumentSearchResult, secret: string): string {
  const payload = base64UrlEncode(JSON.stringify({
    assetType: item.assetType,
    symbol: normalizeSymbol(item.symbol),
    issuedAt: Date.now()
  }));
  const signature = hmac(payload, secret);
  return `${payload}.${signature}`;
}

function verifyInstrumentToken(token: string | undefined, secret: string | undefined): { assetType: AssetType; symbol: string } | undefined {
  if (!token || !secret) {
    return undefined;
  }
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, hmac(payload, secret))) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      assetType?: AssetType;
      symbol?: string;
      issuedAt?: number;
    };
    if (!parsed.assetType || !parsed.symbol || !parsed.issuedAt) {
      return undefined;
    }
    const ageMs = Date.now() - parsed.issuedAt;
    if (ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
      return undefined;
    }
    return {
      assetType: parsed.assetType,
      symbol: normalizeSymbol(parsed.symbol)
    };
  } catch {
    return undefined;
  }
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function searchBuiltins(query: string, assetType?: AssetType): InstrumentSearchResult[] {
  const normalized = normalizeSymbol(query);
  return BUILTIN_INSTRUMENTS.filter((item) => {
    if (assetType && item.assetType !== assetType) {
      return false;
    }
    return normalizeSymbol(item.symbol).includes(normalized) || item.name.toLowerCase().includes(query.toLowerCase());
  });
}

async function searchAlphaStocks(query: string, apiKey: string, timeoutMs: number, httpGet: HttpGet): Promise<InstrumentSearchResult[]> {
  const params = new URLSearchParams({
    function: 'SYMBOL_SEARCH',
    keywords: query,
    apikey: apiKey
  });
  const data = record(JSON.parse(await httpGet(`https://www.alphavantage.co/query?${params.toString()}`, { timeoutMs })));
  return arrayField(data.bestMatches)
    .map((match) => record(match))
    .map((match) => ({
      assetType: 'STOCK' as const,
      symbol: stringField(match['1. symbol']).toUpperCase(),
      name: stringField(match['2. name']),
      market: 'US',
      currency: stringField(match['8. currency']) || 'USD',
      source: 'ALPHA_VANTAGE_SYMBOL_SEARCH'
    }))
    .filter((item) => item.symbol && item.name && /^[A-Z][A-Z0-9.-]{0,14}$/.test(item.symbol));
}

async function searchEastmoneyStocks(query: string, timeoutMs: number, httpGet: HttpGet): Promise<InstrumentSearchResult[]> {
  const params = new URLSearchParams({
    input: query,
    type: '14',
    token: 'D43BF722C8E33D6B7F7C4B4C7E75F6A6',
    count: '8'
  });
  const data = record(JSON.parse(await httpGet(`https://searchapi.eastmoney.com/api/suggest/get?${params.toString()}`, { timeoutMs })));
  const entries = arrayField(record(data.QuotationCodeTable).Data);
  return entries
    .map((entry) => record(entry))
    .map((entry) => {
      const code = stringField(entry.Code || entry.SecurityCode);
      const market = inferCnMarket(code);
      return {
        assetType: 'STOCK' as const,
        symbol: `${code}.${market === 'SH' ? 'SH' : 'SZ'}`,
        name: stringField(entry.Name || entry.SecurityName),
        market: 'CN',
        currency: 'CNY',
        source: 'EASTMONEY_SEARCH'
      };
    })
    .filter((item) => /^\d{6}\.(SH|SZ)$/.test(item.symbol) && item.name);
}

async function searchEastmoneyFunds(query: string, timeoutMs: number, httpGet: HttpGet): Promise<InstrumentSearchResult[]> {
  if (!/^\d{1,6}$/.test(query)) {
    return [];
  }
  const code = query.padStart(6, '0');
  const body = await httpGet(`https://fundgz.1234567.com.cn/js/${encodeURIComponent(code)}.js?rt=${Date.now()}`, { timeoutMs });
  const data = record(parseJsonLike(body));
  const name = stringField(data.name) || stringField(data.fundcode) && `基金 ${code}`;
  return name ? [{ assetType: 'FUND', symbol: code, name, market: 'CN', currency: 'CNY', source: 'EASTMONEY_FUND' }] : [];
}

async function collectBestEffort(items: Map<string, InstrumentSearchResult>, promise: Promise<InstrumentSearchResult[]>): Promise<void> {
  try {
    for (const item of await promise) {
      addResult(items, item);
    }
  } catch {
    // Search suggestions are best-effort; backend validation still rejects unknown symbols.
  }
}

function addResult(items: Map<string, InstrumentSearchResult>, item: InstrumentSearchResult): void {
  items.set(`${item.assetType}_${normalizeSymbol(item.symbol)}`, item);
}

function normalizeQuery(query: string): string {
  return String(query || '').trim();
}

function normalizeSymbol(symbol: string): string {
  return normalizeQuery(symbol).toUpperCase();
}

function symbolMatches(symbol: string, query: string): boolean {
  const normalized = normalizeSymbol(symbol);
  if (normalized === query) {
    return true;
  }
  return /^(\d{6})\.(SH|SZ)$/.test(normalized) && normalized.slice(0, 6) === query;
}

function inferCnMarket(code: string): 'SH' | 'SZ' {
  return code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ';
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

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultHttpGet(url: string, options: { timeoutMs: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, (response: IncomingMessage) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const statusCode = response.statusCode ?? 0;
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
