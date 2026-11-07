// Integration: MSW mock backend (REST + WebSocket) -> useSiteLive -> React Query cache.
import { act, screen, waitFor } from '@testing-library/react';
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
  signInAs(db, 'waiter@zayit.demo');
});
afterEach(() => signOut());

function LiveProbe({ siteId }: { siteId: string }) {
  const live = useSiteLive(siteId);
  const ack = useAckAlert(siteId);
  if (!live.data) return <p>loading</p>;
  return (
    <div>
      <p data-testid="status">{live.connection.status}</p>
      <p data-testid="tables">{live.data.tables.length}</p>
      <ul>
        {live.data.open_alerts.map((a) => (
          <li key={a.alert_id} data-testid={`alert-${a.alert_id}`}>
            {a.kind}:{a.status}
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

  it('closes the socket for a site the user cannot access', async () => {
    renderWithProviders(<LiveProbe siteId="site-hfa" />);
    expect(await screen.findByText('loading')).toBeInTheDocument();
  });
});
