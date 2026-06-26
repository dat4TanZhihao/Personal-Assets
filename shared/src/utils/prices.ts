import type { PriceAssetType } from '../types';

export function priceSymbolCandidates(assetType: PriceAssetType, symbol: string): string[] {
  const raw = symbol.trim();
  const values = new Set<string>([raw]);
  if (assetType === 'STOCK') {
    const cn = normalizeCnStockSymbol(raw);
    if (cn) {
      values.add(cn);
    } else {
      values.add(raw.toUpperCase());
    }
  }
  if (assetType === 'GOLD' || assetType === 'FX') {
    values.add(raw.toUpperCase());
  }
  return Array.from(values).filter((value) => value.length > 0);
}

function normalizeCnStockSymbol(symbol: string): string | undefined {
  const raw = symbol.trim().toUpperCase().replace(/^SH/, '').replace(/^SZ/, '');
  const match = raw.match(/^(\d{6})(?:\.(SH|SZ))?$/);
  if (!match) {
    return undefined;
  }
  const code = match[1];
  const exchange = match[2] ?? (code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ');
  return `${code}.${exchange}`;
}
