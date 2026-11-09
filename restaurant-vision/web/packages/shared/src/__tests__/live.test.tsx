// Integration: MSW mock backend (REST + WebSocket) -> useSiteLive -> React Query cache.
import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAckAlert } from '../api/hooks';
import { useSiteLive } from '../live/useSiteLive';
import { createMockServer } from '../mock/node';
import { renderWithProviders, setupTestI18n, signInAs, signOut } from '../test/utils';

const { db, server } = createMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupTestI18n('en');
  signInAs(db, 'manager@example.com');
});
afterEach(() => signOut());

function LiveProbe({ siteId, alertsOnly }: { siteId: string; alertsOnly?: boolean }) {
  const live = useSiteLive(siteId, { alertsOnly });
  const ack = useAckAlert(siteId);
  if (!live.data) return <p>loading</p>;
  return (
    <div>
      <p data-testid="status">{live.connection.status}</p>
      <p data-testid="tables">{live.data.tables.length}</p>
      <p data-testid="offset">{Math.round(live.clockOffsetS)}</p>
      <ul>
        {live.data.open_alerts.map((a) => (
          <li key={a.alert_id} data-testid={`alert-${a.alert_id}`}>
            {a.kind}:{a.status}:{a.table_label ?? '-'}
            <button onClick={() => ack.mutate(a.alert_id)}>ack {a.alert_id}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('useSiteLive with the mock backend', () => {
  it('loads the snapshot, connects the socket and merges pushed events', async () => {
    renderWithProviders(<LiveProbe siteId="site-tlv" />);
    expect(await screen.findByTestId('tables')).toHaveTextContent('14');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('open'));

    let alertId = '';
    act(() => {
      alertId = db.raiseAlert('site-tlv', 'waiter_needed', 'tlv-t3').alert_id;
    });
    expect(await screen.findByTestId(`alert-${alertId}`)).toHaveTextContent('waiter_needed:open');

    act(() => db.tick());
    expect(screen.getByTestId('tables')).toHaveTextContent('14');
  });

  it('acknowledges an alert anonymously and reflects it immediately', async () => {
    const alert = db.raiseAlert('site-tlv', 'bussing_needed', 'tlv-t4', 'info');
    renderWithProviders(<LiveProbe siteId="site-tlv" />);
    const row = await screen.findByTestId(`alert-${alert.alert_id}`);
    expect(row).toHaveTextContent('bussing_needed:open');
    await act(async () => screen.getByRole('button', { name: `ack ${alert.alert_id}` }).click());
    await waitFor(() => expect(row).toHaveTextContent('bussing_needed:acknowledged'));
    expect(db.acks.has(alert.alert_id)).toBe(true);
    const stored = db.openAlerts('site-tlv').find((a) => a.alert_id === alert.alert_id)!;
    expect(stored).toMatchObject({ status: 'acknowledged', ack_via: 'cloud' });
    expect(JSON.stringify(stored)).not.toMatch(/usr-|waiter@/);
  });

  it('starts from the live.snapshot the socket sends owners and managers', async () => {
    const alert = db.raiseAlert('site-tlv', 'checkin_needed', 'tlv-t5', 'info');
    // A stale REST snapshot without the alert: only the socket's live.snapshot carries it.
    server.use(
      http.get('*/api/v1/sites/:siteId/live', () =>
        HttpResponse.json({ ...db.liveSnapshot('site-tlv')!, open_alerts: [] }),
      ),
    );
    renderWithProviders(<LiveProbe siteId="site-tlv" />);
    expect(await screen.findByTestId(`alert-${alert.alert_id}`)).toHaveTextContent(
      'checkin_needed:open',
    );
  });

  it('waiters: open alerts from /alerts, alert events only, labels refetched', async () => {
    signInAs(db, 'waiter@example.com');
    const before = db.raiseAlert('site-tlv', 'bussing_needed', 'tlv-t6', 'info');
    renderWithProviders(<LiveProbe siteId="site-tlv" alertsOnly />);
    expect(await screen.findByTestId(`alert-${before.alert_id}`)).toHaveTextContent(
      `bussing_needed:open:${before.table_label}`,
    );
    expect(screen.getByTestId('tables')).toHaveTextContent('0');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('open'));
    let raised = before;
    act(() => {
      raised = db.raiseAlert('site-tlv', 'waiter_needed', 'tlv-t2');
      db.tick(); // table, queue and occupancy events: not sent to waiters
    });
    await waitFor(() =>
      expect(screen.getByTestId(`alert-${raised.alert_id}`)).toHaveTextContent(
        `waiter_needed:open:${raised.table_label}`,
      ),
    );
    expect(screen.getByTestId('tables')).toHaveTextContent('0');
  });

  it('tracks how far the edge clock runs ahead (sped-up simulator), never below zero', async () => {
    renderWithProviders(<LiveProbe siteId="site-tlv" />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('open'));
    expect(screen.getByTestId('offset')).toHaveTextContent('0');
    act(() => {
      db.emit('site-tlv', {
        type: 'occupancy.snapshot',
        event_id: '01900000-0000-7000-8000-00000000abcd',
        site_id: 'site-tlv',
        ts: Date.now() / 1000 + 600, // 10 simulated minutes ahead
        schema_version: '1.1',
        guests: 3,
        tables_occupied: 1,
        tables_total: 14,
        staff_on_floor: 2,
      });
    });
    await waitFor(() => expect(screen.getByTestId('offset')).toHaveTextContent('600'));
  });

  it('closes the socket for a site the user cannot access', async () => {
    renderWithProviders(<LiveProbe siteId="site-hfa" />);
    expect(await screen.findByText('loading')).toBeInTheDocument();
  });
});
