import type { Frequency } from '@/api/models';

// Calendar dates (YYYY-MM-DD), same rules as the server's utils/time.js and the web app's shared.ts.

export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const isYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

const parts = (ymd: string) => ymd.split('-').map(Number);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = parts(ymd);
  return fmt(new Date(Date.UTC(y, m - 1, d + days)));
}

export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = parts(ymd);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))));
}

/** Installment schedule preview; mirrors the server (last installment absorbs rounding). */
export function previewSchedule(financedCents: number, count: number, frequency: Frequency, firstDueDate: string, intervalDays = 30) {
  if (!(count >= 1) || financedCents <= 0) return [];
  const base = Math.floor(financedCents / count);
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    dueDate: frequency === 'MONTHLY' ? addMonths(firstDueDate, i) : addDays(firstDueDate, (frequency === 'WEEKLY' ? 7 : intervalDays) * i),
    amountCents: i === count - 1 ? financedCents - base * (count - 1) : base
  }));
}
