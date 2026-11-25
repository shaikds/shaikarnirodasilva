// Host view helpers (contracts 1.3) shared by the dashboard Host page and the waiter Host tab.
import type { HostTable, HostView } from '../contracts';

type T = (key: string, options?: Record<string, unknown>) => string;

/** Whole minutes from `now` until `ts` (never negative). */
export function minutesUntil(ts: number, now: number): number {
  return Math.max(0, Math.round((ts - now) / 60));
}

/** Occupied table whose guests sat down first (the "sitting longest" emphasis), or null. */
export function longestSittingId(tables: readonly HostTable[]): string | null {
  let best: HostTable | null = null;
  for (const t of tables) {
    if (t.seated_since === null) continue;
    if (best === null || t.seated_since < best.seated_since!) best = t;
  }
  return best?.table_id ?? null;
}

/** "Table 5 in ~6 min", "Table 5 – once cleaned", "Table 5 any minute now". */
export function nextFreeText(view: Pick<HostView, 'next_free'>, now: number, t: T): string {
  const next = view.next_free;
  if (!next) return t('common:host.allFree');
  const table = t('common:table.name', { label: next.label });
  if (next.state === 'needs_bussing') return t('common:host.nextFreeCleaning', { table });
  if (next.expected_free_at === null) return table;
  const minutes = minutesUntil(next.expected_free_at, now);
  return minutes <= 1
    ? t('common:host.nextFreeSoon', { table })
    : t('common:host.nextFreeIn', { table, minutes });
}

/** Short status of one table row: free, needs cleaning, or "free in ~N min". */
export function hostTableStatus(table: HostTable, now: number, t: T): string {
  if (table.state === 'empty') return t('common:host.free');
  if (table.state === 'needs_bussing') return t('common:host.needsCleaning');
  if (table.expected_free_at === null) return t(`common:tableState.${table.state}`);
  const minutes = minutesUntil(table.expected_free_at, now);
  return minutes <= 1 ? t('common:host.expectedSoon') : t('common:host.expectedIn', { minutes });
}
