import type { Actor, AgreementDisplayStatus, Frequency, InstallmentState, PaymentMethod, SaleStatus, UnitStatus } from '@/api/models';
import { colors } from '@/theme';

// English labels (translated at render time with t()), and badge colours per status.

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  AVAILABLE: 'Available', SOLD_FULL_PRICE: 'Sold at full price', SOLD_INSTALLMENT: 'Sold on installment'
};
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = { COMPLETED: 'Completed', CANCELLED: 'Cancelled', REFUNDED: 'Refunded' };
export const AGREEMENT_STATUS_LABEL: Record<AgreementDisplayStatus, string> = { ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled', OVERDUE: 'Overdue' };
export const INSTALLMENT_STATE_LABEL: Record<InstallmentState, string> = {
  PAID: 'Paid', PARTLY_PAID: 'Partly paid', UPCOMING: 'Upcoming', OVERDUE: 'Overdue', CANCELLED: 'Cancelled'
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', OTHER: 'Other' };
export const FREQUENCY_LABEL: Record<Frequency, string> = { MONTHLY: 'Monthly', WEEKLY: 'Weekly', CUSTOM: 'Custom' };
export const SALE_TYPE_LABEL = { FULL_PRICE: 'Full price', INSTALLMENT: 'Installment' } as const;

export type Tone = 'green' | 'blue' | 'violet' | 'red' | 'grey' | 'gold';

export const UNIT_STATUS_TONE: Record<UnitStatus, Tone> = { AVAILABLE: 'green', SOLD_FULL_PRICE: 'blue', SOLD_INSTALLMENT: 'violet' };
export const SALE_STATUS_TONE: Record<SaleStatus, Tone> = { COMPLETED: 'green', CANCELLED: 'red', REFUNDED: 'red' };
export const AGREEMENT_STATUS_TONE: Record<AgreementDisplayStatus, Tone> = { ACTIVE: 'blue', COMPLETED: 'green', CANCELLED: 'grey', OVERDUE: 'red' };
export const INSTALLMENT_STATE_TONE: Record<InstallmentState, Tone> = { PAID: 'green', PARTLY_PAID: 'violet', UPCOMING: 'blue', OVERDUE: 'red', CANCELLED: 'grey' };

export const TONE_COLORS: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: colors.successBg, fg: colors.success },
  blue: { bg: colors.infoBg, fg: colors.blue },
  violet: { bg: '#f1edf9', fg: colors.violet },
  red: { bg: colors.dangerBg, fg: colors.danger },
  grey: { bg: '#efefef', fg: '#666' },
  gold: { bg: colors.goldTint, fg: colors.goldText }
};

/** "Shop owner", or "Ayesha (EMP-0001)". Returns [text, params] for t(). */
export function actorLabel(actor: Actor | undefined | null): [string, Record<string, string> | undefined] {
  if (!actor) return ['', undefined];
  if (actor.type === 'owner') return ['Shop owner', undefined];
  return actor.employeeId ? ['{name} ({id})', { name: actor.name, id: actor.employeeId }] : [actor.name, undefined];
}

/** Common choices for the shop time zone; any IANA zone is accepted by the server. */
export const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'UTC'];
