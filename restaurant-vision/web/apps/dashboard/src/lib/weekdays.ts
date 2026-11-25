import { intlLocale } from '@rv/shared';

/** Localized weekday name of an ISO weekday (1 = Monday ... 7 = Sunday). */
export function weekdayName(iso: number, lng: string, style: 'long' | 'short' = 'long'): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(intlLocale(lng === 'en' ? 'en' : 'he'), {
    weekday: style,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2024, 0, iso)));
}
