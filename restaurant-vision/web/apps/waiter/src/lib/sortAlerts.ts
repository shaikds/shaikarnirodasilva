import { alertSince, type AlertView } from '@rv/shared';

/** Longest waiting first: by when the condition began (guests seated), then by raise time. */
const byAge = (a: AlertView, b: AlertView) =>
  alertSince(a) - alertSince(b) ||
  a.raised_at - b.raised_at ||
  a.alert_id.localeCompare(b.alert_id);

/**
 * Waiter list order: alerts nobody took yet first, longest waiting guests at the top (from
 * `condition_since_ts`, else `raised_at`); then alerts someone is already on, same order.
 * Resolved alerts are dropped.
 */
export function sortAlertsForWaiter(alerts: AlertView[]): {
  open: AlertView[];
  taken: AlertView[];
} {
  const live = alerts.filter((a) => a.status !== 'resolved');
  return {
    open: live.filter((a) => a.status === 'open').sort(byAge),
    taken: live.filter((a) => a.status === 'acknowledged').sort(byAge),
  };
}
