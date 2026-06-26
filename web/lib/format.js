export function money(value, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function signedMoney(value, currency = 'CNY') {
  const number = Number(value || 0);
  return `${number >= 0 ? '+' : ''}${money(number, currency)}`;
}

export function percent(value) {
  return `${Number(value || 0) >= 0 ? '+' : ''}${(Number(value || 0) * 100).toFixed(2)}%`;
}

export function trendClass(value) {
  if (Number(value) > 0) return 'trend-positive';
  if (Number(value) < 0) return 'trend-negative';
  return 'trend-neutral';
}

