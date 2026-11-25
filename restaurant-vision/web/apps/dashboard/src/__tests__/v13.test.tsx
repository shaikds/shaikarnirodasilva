// Contracts 1.3 in the dashboard: the "table freed" alert, the Host page, the staffing section
// on Analytics and the staffing settings.
import type { AlertView, LiveSnapshot } from '@rv/shared';
import { createMockServer } from '@rv/shared/mock/node';
import { renderWithProviders, signInAs, signOut } from '@rv/shared/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsPanel } from '../components/LivePanels';
import { StaffingCard } from '../components/StaffingCard';
import { renderApp, renderRoute, setupDashboardI18n } from '../test/utils';

let clock = Date.now() / 1000;
const { db, server } = createMockServer({ seedLive: false, now: () => clock });
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  signOut();
});
afterAll(() => server.close());
beforeEach(async () => {
  await setupDashboardI18n('en');
  clock = Date.now() / 1000;
  signInAs(db, 'demo@example.com');
});

const NOW = 1_800_000_000;

describe('dashboard and contracts 1.3', () => {
  it('shows "Table N freed – needs cleaning" with its icon in the alert list', () => {
    const freed: AlertView = {
      alert_id: 'f1',
      site_id: 'site-tlv',
      kind: 'table_freed',
      severity: 'info',
      status: 'open',
      table_id: 't5',
      table_label: '5',
      zone_id: null,
      raised_at: NOW - 30,
      acked_at: null,
      ack_via: null,
      resolved_at: null,
      resolve_reason: null,
      condition_since_ts: NOW - 75,
    };
    const live: LiveSnapshot = {
      site_id: 'site-tlv',
      ts: NOW,
      tables: [],
      occupancy: null,
      queues: [],
      devices: [],
      open_alerts: [freed],
    };
    renderWithProviders(<AlertsPanel live={live} now={NOW} />);
    expect(screen.getByText('Table 5 freed – needs cleaning')).toBeInTheDocument();
    expect(screen.getByTestId('icon-table-freed')).toBeInTheDocument();
    expect(screen.getByTestId('alert-waiting')).toHaveTextContent(/^Free for 1:15/);
  });

  it('Host page: next free table, queue and the host order, linked from the nav', async () => {
    clock = Date.now() / 1000 - 60 * 60; // overstaying a 55 min dwell: now + 5 min
    db.setTableState('site-tlv', 'tlv-t2', 'seated', 2);
    clock = Date.now() / 1000 - 20 * 60;
    db.setTableState('site-tlv', 'tlv-t3', 'seated', 3);
    db.setTableState('site-tlv', 'tlv-t3', 'attended', 3);
    clock = Date.now() / 1000;
    renderApp('/sites/site-tlv/host');
    expect(await screen.findByTestId('next-free')).toHaveTextContent('Table 2 in ~5 min');
    expect(screen.getByRole('link', { name: 'Host' })).toHaveAttribute(
      'href',
      '/sites/site-tlv/host',
    );
    const list = screen.getByRole('list', { name: 'Tables' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.at(-2)).toHaveTextContent('Table 2');
    expect(rows.at(-1)).toHaveTextContent(/Table 3.*Free in ~\d+ min/);
    expect(screen.getByTestId('host-row-tlv-t2')).toHaveTextContent('Sitting longest');
    expect(rows[0]).toHaveTextContent('Free');
  });

  it('staffing: hourly guests and waiters, weekday/weekend toggle, estimate badge', async () => {
    renderRoute(<StaffingCard siteId="site-tlv" />, '/');
    const card = (await screen.findByRole('heading', { name: /Peak times & staffing/ })).closest(
      'section',
    )!;
    expect(card.querySelector('[data-estimate="true"]')).not.toBeNull();
    const weekday = within(card).getByRole('button', { name: 'Weekdays' });
    expect(weekday).toHaveAttribute('aria-pressed', 'true');
    const strip = await within(card).findByRole('list', { name: 'Recommended waiters per hour' });
    expect(within(strip).getAllByRole('listitem').length).toBeGreaterThan(5);
    expect(card).toHaveTextContent('Weekend: Friday, Saturday');
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Weekend' }));
    expect(within(card).getByRole('button', { name: 'Weekend' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(card).toHaveTextContent('Assumes one waiter serves 20 guests');
  });

  it('settings: staffing tab saves guests per waiter and weekend days', async () => {
    renderApp('/sites/site-tlv/settings?tab=staffing');
    const form = await screen.findByRole('form', { name: 'Staffing' });
    const input = within(form).getByRole('spinbutton', { name: /Guests one waiter can serve/ });
    expect(input).toHaveValue(20);
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '16');
    await user.click(within(form).getByRole('checkbox', { name: 'Sunday' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(db.sites.get('site-tlv')!.settings.guests_per_waiter).toBe(16));
    expect(db.sites.get('site-tlv')!.settings.weekend_days).toEqual([5, 6, 7]);
  });
});
