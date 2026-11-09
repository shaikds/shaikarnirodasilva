// Contracts 1.1 in the dashboard: "waiting since" in the alert list, the edge's LAN address on
// the Devices tab, and the queue_wait / response_time_p90 series on the Analytics page.
import type { AlertView, LiveSnapshot } from '@rv/shared';
import { createMockServer } from '@rv/shared/mock/node';
import { renderWithProviders, signInAs, signOut } from '@rv/shared/test-utils';
import { screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsPanel } from '../components/LivePanels';
import { DevicesTab } from '../components/SettingsForms';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { renderRoute, setupDashboardI18n } from '../test/utils';

const { db, server } = createMockServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  signOut();
});
afterAll(() => server.close());
beforeEach(async () => {
  await setupDashboardI18n('en');
  signInAs(db, 'demo@example.com');
});

const NOW = 1_800_000_000;

const alert = (over: Partial<AlertView>): AlertView => ({
  alert_id: 'a',
  site_id: 'site-tlv',
  kind: 'waiter_needed',
  severity: 'warn',
  status: 'open',
  table_id: 't',
  table_label: '1',
  zone_id: null,
  raised_at: NOW - 60,
  acked_at: null,
  ack_via: null,
  resolved_at: null,
  resolve_reason: null,
  condition_since_ts: null,
  ...over,
});

describe('dashboard and contracts 1.1', () => {
  it('alert list: guests waiting since they sat down, longest first', () => {
    const live: LiveSnapshot = {
      site_id: 'site-tlv',
      ts: NOW,
      tables: [],
      occupancy: null,
      queues: [],
      devices: [],
      open_alerts: [
        alert({ alert_id: 'late', table_label: '2', raised_at: NOW - 200 }),
        alert({
          alert_id: 'seated',
          table_label: '4',
          raised_at: NOW - 60,
          condition_since_ts: NOW - 400,
        }),
      ],
    };
    renderWithProviders(<AlertsPanel live={live} now={NOW} />);
    const rows = screen.getAllByTestId('alert-waiting');
    expect(rows[0]).toHaveTextContent(/^Guests waiting 6:40 · since /);
    expect(rows[1]).toHaveTextContent(/^Guests waiting 3:20 · since /);
  });

  it('Devices tab shows the edge LAN address', async () => {
    const localUrl = db.devices('site-tlv')[0]!.local_url!;
    renderWithProviders(<DevicesTab siteId="site-tlv" canPair />);
    expect(await screen.findByTestId('device-local-url')).toHaveTextContent(localUrl);
    expect(
      screen.getByRole('columnheader', { name: 'LAN address (offline alerts)' }),
    ).toBeInTheDocument();
  });

  it('Analytics shows queue wait and response p90 with data', async () => {
    renderRoute(<AnalyticsPage />, '/sites/site-tlv/analytics', '/sites/:siteId/analytics');
    const queueWait = (
      await screen.findByRole('heading', { name: 'Queue wait before seating (min)' })
    ).parentElement!;
    expect(await within(queueWait).findByText('Show data as a table')).toBeInTheDocument();
    const response = screen.getByRole('heading', {
      name: 'Response time over time, median and p90 (min)',
    }).parentElement!;
    expect(
      await within(response).findByRole('columnheader', { name: '90th percentile (p90)' }),
    ).toBeInTheDocument();
    expect(
      within(response).getByRole('columnheader', { name: 'Median (p50)' }),
    ).toBeInTheDocument();
  });
});
