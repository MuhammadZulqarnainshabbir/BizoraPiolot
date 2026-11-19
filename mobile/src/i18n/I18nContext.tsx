import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UR } from './ur';

export type Lang = 'en' | 'ur';
export type Params = Record<string, string | number | null | undefined>;

const STORAGE_KEY = 'bizora_language';

export const LANGUAGES: { code: Lang; label: string; locale: string }[] = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'ur', label: 'اردو', locale: 'ur' }
];

/**
 * Server messages that contain values. The English text is matched and turned into a
 * translatable template so the value survives translation (same list as the web app).
 */
const SERVER_PATTERNS: { pattern: RegExp; key: string; names: string[] }[] = [
  { pattern: /^Payment exceeds the remaining balance of Rs ([\d,.]+)$/, key: 'Payment exceeds the remaining balance of Rs {amount}', names: ['amount'] },
  { pattern: /^Add at most (\d+) units at a time$/, key: 'Add at most {count} units at a time', names: ['count'] },
  { pattern: /^Serial number (\d+) is empty\. Every unit needs a serial number\.$/, key: 'Serial number {number} is empty. Every unit needs a serial number.', names: ['number'] },
  { pattern: /^Serial number (\d+) is longer than 100 characters$/, key: 'Serial number {number} is longer than 100 characters', names: ['number'] },
  { pattern: /^(.+) must be zero or more, with at most 2 decimals$/, key: '{field} must be zero or more, with at most 2 decimals', names: ['field'] },
  { pattern: /^(.+) must be more than zero, with at most 2 decimals$/, key: '{field} must be more than zero, with at most 2 decimals', names: ['field'] },
  { pattern: /^(.+) must be a whole number between (\d+) and (\d+)$/, key: '{field} must be a whole number between {min} and {max}', names: ['field', 'min', 'max'] },
  { pattern: /^(.+) must be at most (\d+) characters$/, key: '{field} must be at most {max} characters', names: ['field', 'max'] },
  { pattern: /^(.+) is required$/, key: '{field} is required', names: ['field'] }
];

const interpolate = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match).toString()) : text;

/** Translates English text (the key) to the given language, filling in {placeholders}. */
export function translate(lang: Lang, message: string | null | undefined, params?: Params): string {
  if (!message) return '';
  let text = message;
  let values = params;
  if (lang === 'ur') {
    let translated: string | undefined = UR[text];
    if (translated === undefined) {
      for (const { pattern, key, names } of SERVER_PATTERNS) {
        const match = pattern.exec(text);
        if (!match) continue;
        values = { ...values, ...Object.fromEntries(names.map((name, i) => [name, name === 'field' ? UR[match[i + 1]] ?? match[i + 1] : match[i + 1]])) };
        translated = UR[key] ?? key;
        break;
      }
    }
    if (translated !== undefined) text = translated;
  }
  return interpolate(text, values);
}

// ---- number and date formatting (Intl is available in Hermes on iOS and Android)

function groupDigits(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatAmount(value: number, locale: string): string {
  const rounded = Math.round(value * 100) / 100;
  const hasPaisa = Math.abs(Math.round(rounded * 100) % 100) !== 0;
  try {
    return new Intl.NumberFormat(locale === 'ur' ? 'en-US' : locale, { minimumFractionDigits: hasPaisa ? 2 : 0, maximumFractionDigits: hasPaisa ? 2 : 0 }).format(rounded);
  } catch {
    const [whole, fraction] = rounded.toFixed(hasPaisa ? 2 : 0).split('.');
    const sign = whole.startsWith('-') ? '-' : '';
    return `${sign}${groupDigits(whole.replace('-', ''))}${fraction ? `.${fraction}` : ''}`;
  }
}

/** Pakistani rupees from integer paisa: "Rs 195,000" / "195,000 روپے". Paisa shown only when present. */
export function formatMoney(cents: number | null | undefined, lang: Lang): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '';
  const amount = formatAmount(cents / 100, lang === 'ur' ? 'ur' : 'en-US');
  return lang === 'ur' ? `${amount} روپے` : `Rs ${amount}`;
}

export type DateFormat = 'medium' | 'mediumDate' | 'shortTime' | 'MMM d' | 'MMM y';

const DATE_FORMATS: Record<DateFormat, Intl.DateTimeFormatOptions> = {
  medium: { dateStyle: 'medium', timeStyle: 'short' },
  mediumDate: { dateStyle: 'medium' },
  shortTime: { timeStyle: 'short' },
  'MMM d': { month: 'short', day: 'numeric' },
  'MMM y': { month: 'short', year: 'numeric' }
};

/**
 * Date in the current language and the shop's timezone. A calendar date string ("2026-12-11",
 * e.g. an installment due date) is shown as that date, with no timezone shift.
 */
export function formatDate(value: string | Date | null | undefined, format: DateFormat, timeZone: string, lang: Lang): string {
  if (!value) return '';
  const calendarDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = calendarDate ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'ur' ? 'ur' : 'en-US';
  try {
    const text = new Intl.DateTimeFormat(locale, { ...DATE_FORMATS[format], timeZone: calendarDate ? 'UTC' : timeZone }).format(date);
    return lang === 'ur' ? text.replace(/\bAM\b/g, 'قبل دوپہر').replace(/\bPM\b/g, 'بعد دوپہر') : text;
  } catch {
    return date.toISOString().slice(0, format === 'medium' ? 16 : 10).replace('T', ' ');
  }
}

interface I18nValue {
  lang: Lang;
  isRtl: boolean;
  ready: boolean;
  setLang: (lang: Lang) => void;
  t: (message: string | null | undefined, params?: Params) => string;
  money: (cents: number | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => { if (stored === 'ur' || stored === 'en') setLangState(stored); })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    lang,
    isRtl: lang === 'ur',
    ready,
    setLang,
    t: (message, params) => translate(lang, message, params),
    money: cents => formatMoney(cents, lang)
  }), [lang, ready, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
