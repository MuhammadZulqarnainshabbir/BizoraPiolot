import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatNumber } from '@angular/common';
import { I18nService, Lang, Msg, Params } from './i18n.service';
import { PortalService } from '../portal.service';

// These pipes are impure so they re-render the moment the language changes. Each keeps a
// one-entry cache, so repeated change detection with the same inputs does no extra work.

/** `{{ 'Save changes' | t }}` or `{{ 'Page {page} of {pages}' | t:{ page: 1, pages: 3 } }}` */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(message: Msg | null | undefined, params?: Params): string {
    return this.i18n.t(message, params);
  }
}

const DATE_FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  medium: { dateStyle: 'medium', timeStyle: 'short' },
  mediumDate: { dateStyle: 'medium' },
  shortTime: { timeStyle: 'short' },
  'MMM d': { month: 'short', day: 'numeric' },
  'MMM y': { month: 'short', year: 'numeric' }
};

/**
 * Date in the current language and the shop's timezone, e.g. `{{ sale.soldAt | tDate:'medium' }}`.
 * Formats: medium (date + time), mediumDate, shortTime, 'MMM d'. A calendar date string
 * ("2026-12-11", e.g. an installment due date) is shown as that date, with no timezone shift.
 */
@Pipe({ name: 'tDate', standalone: true, pure: false })
export class LocalDatePipe implements PipeTransform {
  private i18n = inject(I18nService);
  private portal = inject(PortalService);
  private last?: { key: string; value: string };
  transform(value: string | Date | null | undefined, format = 'mediumDate'): string {
    if (!value) return '';
    const locale = this.i18n.locale();
    const calendarDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const timeZone = calendarDate ? 'UTC' : this.portal.timezone();
    const key = `${locale}|${timeZone}|${format}|${value instanceof Date ? value.toISOString() : value}`;
    if (this.last?.key !== key) {
      const date = calendarDate ? new Date(`${value}T00:00:00Z`) : new Date(value);
      const text = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { ...(DATE_FORMATS[format] ?? DATE_FORMATS['mediumDate']), timeZone }).format(date);
      this.last = { key, value: localizeDayPeriod(text, locale) };
    }
    return this.last.value;
  }
}

/** Angular's Urdu locale data prints Latin AM/PM; use the Urdu terms instead. */
function localizeDayPeriod(text: string, locale: string): string {
  return locale === 'ur' ? text.replace(/\bAM\b/g, 'قبل دوپہر').replace(/\bPM\b/g, 'بعد دوپہر') : text;
}

/**
 * Pakistani rupee amount, e.g. `{{ item.price | tMoney }}` → "Rs 195,000" / "195,000 روپے".
 * Paisa are shown only when present (an uneven installment like Rs 128,571.43).
 */
@Pipe({ name: 'tMoney', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private i18n = inject(I18nService);
  private last?: { key: string; value: string };
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    const locale = this.i18n.locale();
    const key = `${locale}|${value}`;
    if (this.last?.key !== key) this.last = { key, value: formatRupees(value, this.i18n.lang(), locale) };
    return this.last.value;
  }
}

function formatRupees(value: number, lang: Lang, locale: string): string {
  const digits = Number.isInteger(Math.round(value * 100) / 100) ? '1.0-0' : '1.2-2';
  const amount = formatNumber(value, locale, digits);
  // Urdu writes the currency after the number; the bidi isolate keeps "-" and digits in order.
  return lang === 'ur' ? `⁦${amount}⁩ روپے` : `Rs ${amount}`;
}

export const I18N_PIPES = [TranslatePipe, LocalDatePipe, MoneyPipe] as const;
