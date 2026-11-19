import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Observable } from 'rxjs';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { Actor, AgreementDisplayStatus, Frequency, InstallmentState, PaymentMethod, SaleStatus, UnitStatus } from './product.models';

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpErrorResponse ? error.error?.message || fallback : fallback;
}

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  AVAILABLE: tk('Available'), SOLD_FULL_PRICE: tk('Sold at full price'), SOLD_INSTALLMENT: tk('Sold on installment')
};
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = { COMPLETED: tk('Completed'), CANCELLED: tk('Cancelled'), REFUNDED: tk('Refunded') };
export const AGREEMENT_STATUS_LABEL: Record<AgreementDisplayStatus, string> = {
  ACTIVE: tk('Active'), COMPLETED: tk('Completed'), CANCELLED: tk('Cancelled'), OVERDUE: tk('Overdue')
};
export const INSTALLMENT_STATE_LABEL: Record<InstallmentState, string> = {
  PAID: tk('Paid'), PARTLY_PAID: tk('Partly paid'), UPCOMING: tk('Upcoming'), OVERDUE: tk('Overdue'), CANCELLED: tk('Cancelled')
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: tk('Cash'), BANK_TRANSFER: tk('Bank transfer'), CARD: tk('Card'), OTHER: tk('Other')
};
export const FREQUENCY_LABEL: Record<Frequency, string> = { MONTHLY: tk('Monthly'), WEEKLY: tk('Weekly'), CUSTOM: tk('Custom') };
export const SALE_TYPE_LABEL = { FULL_PRICE: tk('Full price'), INSTALLMENT: tk('Installment') } as const;

/** "Shop owner", or "Ayesha (EMP-0001)". */
export function actorLabel(actor: Actor | undefined | null): Msg {
  if (!actor) return '';
  if (actor.type === 'owner') return tk('Shop owner');
  return actor.employeeId ? msg('{name} ({id})', { name: actor.name, id: actor.employeeId }) : actor.name;
}

/** Rupees with at most 2 decimals, ≥ 0 (or > 0). */
export function moneyValidator({ allowZero = true } = {}): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return { money: true };
    return Math.abs(Math.round(n * 100) - n * 100) > 1e-6 ? { money: true } : null;
  };
}
export const toCents = (value: unknown) => Math.round((Number(value) || 0) * 100);

/** Serial numbers from a textarea: one per line, trimmed, blanks ignored. */
export function parseSerials(text: string): string[] {
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
/** Serials that appear more than once (ignoring case and spaces, like the server). */
export function duplicateSerials(serials: string[]): string[] {
  const seen = new Set<string>(), dupes = new Set<string>();
  for (const s of serials) { const key = s.replace(/\s+/g, '').toUpperCase(); if (seen.has(key)) dupes.add(s); else seen.add(key); }
  return [...dupes];
}

// ---- calendar dates (YYYY-MM-DD), same rules as the server's utils/time.js

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
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

/** Downloads a PDF receipt from an API call that returns a Blob response, saving it under the server's file name. */
export function downloadPdf(request: Observable<HttpResponse<Blob>>, fallbackName: string, onError: (error: unknown) => void, onDone?: () => void) {
  request.subscribe({
    next: res => { if (res.body) saveBlob(res.body, res.headers.get('Content-Disposition'), fallbackName); onDone?.(); },
    error: (error: unknown) => { onDone?.(); onError(error); }
  });
}

/** Saves a downloaded Blob (CSV export) with the file name the server suggested. */
export function saveBlob(blob: Blob, contentDisposition: string | null, fallback: string) {
  const name = /filename="?([^"]+)"?/.exec(contentDisposition ?? '')?.[1] ?? fallback;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
