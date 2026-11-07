import type { AlertView } from '@rv/shared';

const byAge = (a: AlertView, b: AlertView) =>
  a.raised_at - b.raised_at || a.alert_id.localeCompare(b.alert_id);

/**
 * Waiter list order: alerts nobody took yet first, oldest (longest waiting) at the top;
 * then alerts someone is already on, also oldest first. Resolved alerts are dropped.
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
