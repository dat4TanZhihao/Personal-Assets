export function toCsv<T extends object>(rows: T[]): string {
  if (rows.length === 0) {
    return '';
  }
  const internalKeys = new Set(['_id', 'userId', 'accountId']);
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => {
      if (!internalKeys.has(key)) {
        set.add(key);
      }
    });
    return set;
  }, new Set<string>()));

  const lines = [
    columns.map(escapeCsv).join(','),
    ...rows.map((row) => {
      const record = row as Record<string, unknown>;
      return columns.map((column) => escapeCsv(formatValue(record[column]))).join(',');
    })
  ];
  return `${lines.join('\n')}\n`;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}
