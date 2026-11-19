import { TestBed } from '@angular/core/testing';
import { I18nService, msg, tk } from './i18n.service';

describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.removeItem('electrohub_language');
    i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
  });

  afterEach(() => {
    i18n.setLanguage('en');
    localStorage.removeItem('electrohub_language');
  });

  it('shows English as written, with placeholders filled in', () => {
    expect(i18n.t('Hello, {name}', { name: 'Ali' })).toBe('Hello, Ali');
    expect(i18n.t(msg('{count} units', { count: 3 }))).toBe('3 units');
    expect(tk('Inventory')).toBe('Inventory');
    expect(i18n.t('')).toBe('');
    expect(i18n.t(null)).toBe('');
  });

  it('switches every string to Urdu and the page to right-to-left', () => {
    i18n.setLanguage('ur');
    expect(i18n.t('Inventory')).toBe('انوینٹری');
    expect(i18n.t('{count} units', { count: 3 })).toBe('3 یونٹ');
    expect(document.documentElement.lang).toBe('ur');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('electrohub_language')).toBe('ur');

    i18n.setLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('translates API validation messages, including the field name inside them', () => {
    i18n.setLanguage('ur');
    expect(i18n.t('Sale price is required')).toBe('قیمتِ فروخت ضروری ہے');
    expect(i18n.t('Number of installments must be a whole number between 1 and 120')).toBe('اقساط کی تعداد 1 اور 120 کے درمیان مکمل عدد ہونا چاہیے');
    expect(i18n.t('Payment exceeds the remaining balance of Rs 66,666.67')).toContain('66,666.67');
  });

  it('leaves user-entered text (no translation) as typed', () => {
    i18n.setLanguage('ur');
    expect(i18n.t('Hair Gyesar')).toBe('Hair Gyesar');
  });
});
