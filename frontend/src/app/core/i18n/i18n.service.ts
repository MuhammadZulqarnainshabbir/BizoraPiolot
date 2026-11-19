import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UR } from './ur';

export type Lang = 'en' | 'ur';
export type Params = Record<string, string | number | null | undefined>;
export interface Message { text: string; params?: Params; }
/** A user-facing message: plain English text, or English text with {placeholders} and values. */
export type Msg = string | Message;

/**
 * Marks an English string as translatable without translating it yet (the template's `t`
 * pipe does that at render time, so it follows language changes). `npm run i18n:check`
 * finds strings through these markers.
 */
export const tk = (text: string): string => text;
export const msg = (text: string, params?: Params): Message => ({ text, params });

const LANGUAGES: Record<Lang, { label: string; dir: 'ltr' | 'rtl'; locale: string }> = {
  en: { label: 'English', dir: 'ltr', locale: 'en-US' },
  ur: { label: 'اردو', dir: 'rtl', locale: 'ur' }
};
const STORAGE_KEY = 'electrohub_language';

/**
 * Server messages that contain values. The English text is matched and turned into a
 * translatable template so the value survives translation.
 */
const SERVER_PATTERNS: { pattern: RegExp; key: string; names: string[] }[] = [
  { pattern: /^Payment exceeds the remaining balance of Rs ([\d,.]+)$/, key: tk('Payment exceeds the remaining balance of Rs {amount}'), names: ['amount'] },
  { pattern: /^Add at most (\d+) units at a time$/, key: tk('Add at most {count} units at a time'), names: ['count'] },
  { pattern: /^Serial number (\d+) is empty\. Every unit needs a serial number\.$/, key: tk('Serial number {number} is empty. Every unit needs a serial number.'), names: ['number'] },
  { pattern: /^Serial number (\d+) is longer than 100 characters$/, key: tk('Serial number {number} is longer than 100 characters'), names: ['number'] },
  // Field validation from the API; {field} is an English field label, translated as well.
  { pattern: /^(.+) must be zero or more, with at most 2 decimals$/, key: tk('{field} must be zero or more, with at most 2 decimals'), names: ['field'] },
  { pattern: /^(.+) must be more than zero, with at most 2 decimals$/, key: tk('{field} must be more than zero, with at most 2 decimals'), names: ['field'] },
  { pattern: /^(.+) must be a whole number between (\d+) and (\d+)$/, key: tk('{field} must be a whole number between {min} and {max}'), names: ['field', 'min', 'max'] },
  { pattern: /^(.+) must be at most (\d+) characters$/, key: tk('{field} must be at most {max} characters'), names: ['field', 'max'] },
  { pattern: /^(.+) is required$/, key: tk('{field} is required'), names: ['field'] }
];

const interpolate = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match).toString()) : text;

/**
 * Runtime translation. English text is the key; Urdu comes from `ur.ts`. Everything visible
 * is rendered through `t()`, so switching language updates every word immediately, including
 * messages already on screen.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private document = inject(DOCUMENT);
  private title = inject(Title);

  readonly languages = (Object.keys(LANGUAGES) as Lang[]).map(code => ({ code, label: LANGUAGES[code].label }));
  readonly lang = signal<Lang>(this.storedLanguage());
  readonly dir = computed(() => LANGUAGES[this.lang()].dir);
  readonly locale = computed(() => LANGUAGES[this.lang()].locale);

  constructor() {
    this.applyToDocument();
  }

  setLanguage(lang: Lang) {
    if (lang === this.lang()) return;
    this.lang.set(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode: choice lasts for this page only */ }
    this.applyToDocument();
  }

  t(message: Msg | null | undefined, params?: Params): string {
    if (message === null || message === undefined || message === '') return '';
    let text = typeof message === 'string' ? message : message.text;
    let values = typeof message === 'string' ? params : { ...message.params, ...params };
    if (this.lang() === 'ur') {
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
      // Untranslated text (e.g. a free-text category typed by a user) is shown as-is.
      if (translated !== undefined) text = translated;
    }
    return interpolate(text, values);
  }

  private applyToDocument() {
    const root = this.document.documentElement;
    root.lang = this.lang();
    root.dir = this.dir();
    this.title.setTitle(this.t(tk('Bizora Pilot | Shop Management')));
  }

  private storedLanguage(): Lang {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'ur' || stored === 'en' ? stored : 'en';
    } catch {
      return 'en';
    }
  }
}
