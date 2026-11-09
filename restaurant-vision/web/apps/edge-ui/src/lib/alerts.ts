// Ordering and wording for the offline waiter page.
import { alertSince, type AlertView } from '@rv/shared';

/** Longest waiting first: by when the condition began (guests seated), then by raise time. */
const byAge = (a: AlertView, b: AlertView) =>
  alertSince(a) - alertSince(b) ||
  a.raised_at - b.raised_at ||
  a.alert_id.localeCompare(b.alert_id);

/**
 * Alerts nobody took yet first, longest waiting guests at the top (`condition_since_ts`, else
 * `raised_at`); then alerts someone is on, same order. Resolved alerts are dropped.
 */
export function sortAlerts(alerts: readonly AlertView[]): { open: AlertView[]; taken: AlertView[] } {
  const live = alerts.filter((a) => a.status !== 'resolved');
  return {
    open: live.filter((a) => a.status === 'open').sort(byAge),
    taken: live.filter((a) => a.status === 'acknowledged').sort(byAge),
  };
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Table 12" for table alerts, "Entrance" for queue alerts. */
export function alertTitle(alert: AlertView, t: T): string {
  return alert.table_label
    ? t('common:table.name', { label: alert.table_label })
    : alert.table_id
      ? t('common:table.name', { label: alert.table_id })
      : t('alerts.entrance');
}

/** Ids of open alerts in `next` that were not in `seen`. */
export function freshAlerts(seen: ReadonlySet<string>, next: readonly AlertView[]): AlertView[] {
  return next.filter((a) => a.status === 'open' && !seen.has(a.alert_id));
}
