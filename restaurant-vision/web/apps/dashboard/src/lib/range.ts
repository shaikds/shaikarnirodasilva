import { dayRange, lastDaysRange, todayIn } from '@rv/shared';
import { useMemo } from 'react';

export type RangeKey = 'today' | '7d' | '30d';
export const RANGE_KEYS: RangeKey[] = ['today', '7d', '30d'];

/**
 * `[from, to)` for a period in the site time zone. Values are rounded to the minute so the
 * React Query key stays stable between renders.
 */
export function useRange(key: RangeKey, timeZone: string) {
  const minute = Math.floor(Date.now() / 60_000);
  return useMemo(() => {
    const now = minute * 60;
    if (key === 'today') return dayRange(todayIn(timeZone, now), timeZone);
    return lastDaysRange(key === '7d' ? 7 : 30, timeZone, now);
  }, [key, timeZone, minute]);
}
