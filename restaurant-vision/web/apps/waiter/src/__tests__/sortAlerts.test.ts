import type { AlertView } from '@rv/shared';
import { describe, expect, it } from 'vitest';
import { sortAlertsForWaiter } from '../lib/sortAlerts';

const alert = (
  id: string,
  raised_at: number,
  status: AlertView['status'] = 'open',
  condition_since_ts: number | null = null,
): AlertView => ({
  alert_id: id,
  site_id: 's',
  kind: 'waiter_needed',
  severity: 'warn',
  status,
  table_id: 't',
  table_label: id,
  zone_id: null,
  raised_at,
  acked_at: status === 'acknowledged' ? raised_at + 5 : null,
  ack_via: status === 'acknowledged' ? 'cloud' : null,
  resolved_at: null,
  resolve_reason: null,
  condition_since_ts,
});

describe('sortAlertsForWaiter', () => {
  it('puts untaken alerts first, oldest (longest waiting) on top', () => {
    const { open, taken } = sortAlertsForWaiter([
      alert('new', 300),
      alert('taken-old', 50, 'acknowledged'),
      alert('oldest', 100),
      alert('middle', 200),
      alert('taken-new', 250, 'acknowledged'),
      alert('gone', 10, 'resolved'),
    ]);
    expect(open.map((a) => a.alert_id)).toEqual(['oldest', 'middle', 'new']);
    expect(taken.map((a) => a.alert_id)).toEqual(['taken-old', 'taken-new']);
  });

  it('is stable for equal times', () => {
    const { open } = sortAlertsForWaiter([alert('b', 1), alert('a', 1)]);
    expect(open.map((a) => a.alert_id)).toEqual(['a', 'b']);
  });

  it('orders by how long the guests have been waiting (condition_since_ts)', () => {
    // b was raised first, but a's guests sat down earlier: a waits longest.
    const { open } = sortAlertsForWaiter([
      alert('b', 100, 'open', 90),
      alert('a', 150, 'open', 40),
      alert('c', 120), // 1.0 producer: raised_at stands in
    ]);
    expect(open.map((x) => x.alert_id)).toEqual(['a', 'b', 'c']);
  });
});
