// Contracts 1.3 in the waiter app: the "table freed" alert and the compact Host tab.
import { createMockServer } from '@rv/shared/mock/node';
import { signInAs, signOut } from '@rv/shared/test-utils';
import { screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildNotification } from '../lib/notification';
import { renderWaiter, setupWaiterI18n } from '../test/utils';

vi.mock('../lib/sound', () => ({
  playAlertSound: vi.fn(() => true),
  vibrate: vi.fn(() => true),
  audioLocked: () => false,
  installAudioUnlock: () => () => undefined,
}));

let clock = Date.now() / 1000;
const { db, server } = createMockServer({ seedLive: false, now: () => clock });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  signOut();
});
afterAll(() => server.close());
beforeEach(async () => {
  await setupWaiterI18n('en');
  clock = Date.now() / 1000;
});

describe('table freed alert', () => {
  it('shows "Table N freed – needs cleaning" with its own icon', async () => {
    db.raiseAlert('site-tlv', 'table_freed', 'tlv-t4', 'info');
    signInAs(db, 'waiter@example.com');
    renderWaiter('/');
    const list = await screen.findByRole('list', { name: 'Open alerts' });
    const card = within(list)
      .getAllByRole('article')
      .find((a) => a.textContent?.includes('Table 4 freed – needs cleaning'))!;
    expect(card).toBeDefined();
    expect(within(card).getByTestId('icon-table-freed')).toBeInTheDocument();
    expect(card).toHaveTextContent('Free for');
  });

  it('builds the push text in Hebrew and English', () => {
    const payload = { kind: 'table_freed', table_label: '5', severity: 'info', alert_id: 'a1' };
    expect(buildNotification(payload, 'en').title).toBe('Table 5 freed – needs cleaning');
    expect(buildNotification(payload, 'he').title).toBe('שולחן 5 התפנה – לנקות');
  });
});

describe('host tab', () => {
  it('shows the next table to free, the queue and the sorted tables', async () => {
    clock = Date.now() / 1000 - 50 * 60; // seated 50 min ago: 2 guests, ~55 min dwell
    db.setTableState('site-tlv', 'tlv-t1', 'seated', 2);
    clock = Date.now() / 1000 - 10 * 60;
    db.setTableState('site-tlv', 'tlv-t3', 'seated', 4);
    clock = Date.now() / 1000;
    signInAs(db, 'waiter@example.com');
    renderWaiter('/host');
    expect(await screen.findByTestId('next-free')).toHaveTextContent(/Table 1 in ~\d+ min/);
    const list = screen.getByRole('list', { name: 'Tables' });
    const rows = within(list).getAllByRole('listitem');
    // free tables first, then occupied ones by expected free time
    expect(rows.at(-2)).toHaveTextContent('Table 1');
    expect(rows.at(-1)).toHaveTextContent('Table 3');
    expect(screen.getByTestId('host-row-tlv-t1')).toHaveTextContent('Sitting longest');
    expect(screen.getByRole('link', { name: 'Host' })).toHaveAttribute('aria-current', 'page');
  });
});
