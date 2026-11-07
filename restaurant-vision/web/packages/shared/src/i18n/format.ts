// Intl-based formatters. Units come from the i18n resources (`common:units.*`), so
// "4 דק׳" / "4 min" are translatable strings, not code.
import type { Currency, Locale } from '../contracts';
import { i18n } from './index';

const INTL_LOCALE: Record<Locale, string> = { he: 'he-IL', en: 'en-US' };

export function intlLocale(lng: Locale): string {
  return INTL_LOCALE[lng];
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(lng: Locale, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lng}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intlLocale(lng), opts);
    cache.set(key, f);
  }
  return f;
}

function unit(lng: Locale, key: 's' | 'min' | 'h' | 'hmin', vars: Record<string, string>): string {
  return i18n.getFixedT(lng, 'common')(`units.${key}`, vars);
}

export function formatNumber(value: number, lng: Locale, maxFractionDigits = 0): string {
  return nf(lng, { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatPercent(fraction: number, lng: Locale, maxFractionDigits = 0): string {
  return nf(lng, { style: 'percent', maximumFractionDigits: maxFractionDigits }).format(fraction);
}

/** Money in the site's currency (ILS / USD / AUD), whole units by default. */
export function formatCurrency(
  amount: number,
  currency: Currency,
  lng: Locale,
  maxFractionDigits = 0,
): string {
  return nf(lng, {
    style: 'currency',
    currency,
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Compact duration: `45 s`, `4 min`, `2 h`, `1 h 5 min` (he: `45 שנ׳`, `4 דק׳`, `1 שע׳ 5 דק׳`).
 * Under a minute shows seconds; otherwise whole minutes (rounded).
 */
export function formatDuration(seconds: number, lng: Locale): string {
  const s = Math.max(0, seconds);
  const n = (v: number) => formatNumber(v, lng);
  if (Math.round(s) < 60) return unit(lng, 's', { n: n(Math.round(s)) });
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return unit(lng, 'min', { n: n(totalMin) });
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? unit(lng, 'h', { n: n(h) }) : unit(lng, 'hmin', { h: n(h), m: n(m) });
}

/** Stopwatch style elapsed time: `4:05`, `1:02:03`. Language independent digits. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "4 minutes ago" / "לפני 4 דקות" for an epoch-seconds timestamp. */
export function formatRelativeTime(tsSeconds: number, lng: Locale, nowSeconds = Date.now() / 1000): string {
  const diff = tsSeconds - nowSeconds;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(lng), { numeric: 'auto' });
  if (abs < 45) return i18n.getFixedT(lng, 'common')('time.now');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Time of day in the site's time zone, e.g. `14:05` / `2:05 PM`. */
export function formatTime(tsSeconds: number, lng: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(lng), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(tsSeconds * 1000));
}

/** Hour label for charts in the site's time zone, e.g. `14:00`. */
export function formatHour(tsSeconds: number, lng: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(lng), {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: lng === 'he' ? 'h23' : undefined,
    timeZone,
  }).format(new Date(tsSeconds * 1000));
}

/** Calendar date in the site's time zone. */
export function formatDate(
  tsSeconds: number,
  lng: Locale,
  timeZone?: string,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  return new Intl.DateTimeFormat(intlLocale(lng), { dateStyle: style, timeZone }).format(
    new Date(tsSeconds * 1000),
  );
}

export function formatDateTime(tsSeconds: number, lng: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(intlLocale(lng), {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(tsSeconds * 1000));
}
