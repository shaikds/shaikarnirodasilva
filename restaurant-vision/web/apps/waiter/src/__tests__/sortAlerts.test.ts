import type { AlertView } from '@rv/shared';
import { describe, expect, it } from 'vitest';
import { sortAlertsForWaiter } from '../lib/sortAlerts';

const alert = (id: string, raised_at: number, status: AlertView['status'] = 'open'): AlertView => ({
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
});
