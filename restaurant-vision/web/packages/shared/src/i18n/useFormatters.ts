import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Currency, Locale } from '../contracts';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatHour,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTime,
} from './format';
import { isLocale } from './index';

/** Formatters bound to the active UI language. */
export function useFormatters() {
  const { i18n } = useTranslation();
  const raw = i18n.resolvedLanguage ?? i18n.language;
  const lng: Locale = isLocale(raw) ? raw : 'he';
  return useMemo(
    () => ({
      lng,
      number: (v: number, digits = 0) => formatNumber(v, lng, digits),
      percent: (v: number, digits = 0) => formatPercent(v, lng, digits),
      currency: (v: number, currency: Currency, digits = 0) =>
        formatCurrency(v, currency, lng, digits),
      duration: (s: number) => formatDuration(s, lng),
      elapsed: formatElapsed,
      relative: (ts: number, now?: number) => formatRelativeTime(ts, lng, now),
      time: (ts: number, tz?: string) => formatTime(ts, lng, tz),
      hour: (ts: number, tz?: string) => formatHour(ts, lng, tz),
      date: (ts: number, tz?: string, style?: 'short' | 'medium' | 'long') =>
        formatDate(ts, lng, tz, style),
      dateTime: (ts: number, tz?: string) => formatDateTime(ts, lng, tz),
    }),
    [lng],
  );
}
