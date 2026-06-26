import type { PlanFrequency, Range } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(parseDate(date).getTime() + days * MS_PER_DAY));
}

export function compareDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isoDayOfWeek(date: string): number {
  const day = parseDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startDateForRange(range: Range, today: string): string | undefined {
  if (range === 'ALL') {
    return undefined;
  }
  if (range === 'YTD') {
    return `${today.slice(0, 4)}-01-01`;
  }
  const daysByRange: Record<Exclude<Range, 'ALL' | 'YTD'>, number> = {
    '1W': 6,
    '1M': 29,
    '6M': 182,
    '1Y': 364,
    '7D': 6,
    '30D': 29,
    '90D': 89
  };
  const days = daysByRange[range];
  return addDays(today, -days);
}

export function calculateNextRunDate(input: {
  frequency: PlanFrequency;
  startDate: string;
  fromDate: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  endDate?: string | null;
}): string | null {
  const earliest = compareDate(input.fromDate, input.startDate) > 0 ? input.fromDate : input.startDate;
  let next: string;

  if (input.frequency === 'MONTHLY') {
    const targetDay = input.dayOfMonth ?? parseDate(input.startDate).getUTCDate();
    next = nextMonthlyDate(earliest, targetDay);
  } else {
    const targetIsoDay = input.dayOfWeek ?? isoDayOfWeek(input.startDate);
    next = nextWeeklyDate(earliest, targetIsoDay);
    if (input.frequency === 'BIWEEKLY') {
      const anchor = nextWeeklyDate(input.startDate, targetIsoDay);
      while (daysBetween(anchor, next) % 14 !== 0) {
        next = addDays(next, 7);
      }
    }
  }

  if (input.endDate && compareDate(next, input.endDate) > 0) {
    return null;
  }
  return next;
}

function nextWeeklyDate(fromDate: string, targetIsoDay: number): string {
  const current = isoDayOfWeek(fromDate);
  const offset = (targetIsoDay - current + 7) % 7;
  return addDays(fromDate, offset);
}

function nextMonthlyDate(fromDate: string, dayOfMonth: number): string {
  const from = parseDate(fromDate);
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  let candidate = dateInMonth(year, month, dayOfMonth);
  if (compareDate(candidate, fromDate) < 0) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = dateInMonth(year, month, dayOfMonth);
  }
  return candidate;
}

function dateInMonth(year: number, month: number, dayOfMonth: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(dayOfMonth, 1), lastDay);
  return toDateString(new Date(Date.UTC(year, month, day)));
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / MS_PER_DAY);
}
