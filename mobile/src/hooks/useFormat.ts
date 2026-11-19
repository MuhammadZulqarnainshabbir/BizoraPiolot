import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { formatDate, useI18n, type DateFormat } from '@/i18n/I18nContext';

/** Translation, money and date formatting in the current language and the shop's time zone. */
export function useFormat() {
  const { t, money, lang, isRtl } = useI18n();
  const { timezone } = useAuth();
  const date = useCallback((value: string | Date | null | undefined, format: DateFormat = 'mediumDate') => formatDate(value, format, timezone, lang), [timezone, lang]);
  return { t, money, date, lang, isRtl, timezone };
}
