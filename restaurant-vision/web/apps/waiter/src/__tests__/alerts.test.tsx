// Waiter alert list against the MSW mock backend: order by age, anonymous ack, new-alert cues.
import { createMockServer } from '@rv/shared/mock/node';
import { signInAs, signOut } from '@rv/shared/test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { playAlertSound, vibrate } from '../lib/sound';
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
  vi.mocked(playAlertSound).mockClear();
  vi.mocked(vibrate).mockClear();
});

function raiseAt(
  secondsAgo: number,
  tableId: string,
  kind: 'waiter_needed' | 'bussing_needed' = 'waiter_needed',
) {
  clock = Date.now() / 1000 - secondsAgo;
  const a = db.raiseAlert('site-tlv', kind, tableId);
  clock = Date.now() / 1000;
  return a;
}

const cardTitles = (list: HTMLElement) =>
  within(list)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('waiter alerts', () => {
  it('lists open alerts oldest first with label, kind, timer and a big "On it" button', async () => {
    raiseAt(60, 'tlv-t3');
    raiseAt(300, 'tlv-t1', 'bussing_needed');
    raiseAt(120, 'tlv-t2');
    signInAs(db, 'waiter@zayit.demo');
    renderWaiter('/');
    const list = await screen.findByRole('list', { name: 'Open alerts' });
    expect(cardTitles(list)).toEqual(['Table 1', 'Table 2', 'Table 3']);
    const first = within(list).getAllByRole('article')[0]!;
    expect(first).toHaveTextContent('Bussing needed');
    expect(first).toHaveTextContent(/Waiting 5:0\d/);
    const button = within(first).getByRole('button', { name: 'On it: Table 1 · Bussing needed' });
    expect(button).toHaveTextContent('On it');
    expect(button.className).toContain('min-h-[64px]');
  });

  it('acknowledges anonymously and moves the alert to "In progress"', async () => {
    db.openAlerts('site-tlv').forEach((a) => db.ack(a.alert_id));
    const fresh = raiseAt(30, 'tlv-t5');
    signInAs(db, 'waiter@zayit.demo');
    renderWaiter('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'On it: Table 5 · Waiter needed' }));
    const section = await screen.findByRole('region', { name: 'In progress' });
    await waitFor(() => expect(cardTitles(section)).toContain('Table 5'));
    expect(within(section).getAllByText('Someone is on it').length).toBeGreaterThan(0);
    expect(db.acks.has(fresh.alert_id)).toBe(true);
    const stored = db.openAlerts('site-tlv').find((a) => a.alert_id === fresh.alert_id)!;
    expect(stored.status).toBe('acknowledged');
    expect(JSON.stringify(stored)).not.toMatch(/usr-|waiter@|name/);
  });

  it('chimes and vibrates for a new alert, but not for alerts already shown', async () => {
    raiseAt(90, 'tlv-t6');
    signInAs(db, 'waiter@zayit.demo');
    renderWaiter('/');
    await screen.findByRole('list', { name: 'Open alerts' });
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /Live connection: Live/ })).toBeInTheDocument(),
    );
    expect(playAlertSound).not.toHaveBeenCalled();
    act(() => {
      db.raiseAlert('site-tlv', 'waiter_needed', 'tlv-t7', 'urgent');
    });
    expect(await screen.findByRole('heading', { name: 'Table 7' })).toBeInTheDocument();
    await waitFor(() => expect(playAlertSound).toHaveBeenCalledWith(true));
    expect(vibrate).toHaveBeenCalledWith(true);
    expect(screen.getByText(/New alert: Table 7/)).toBeInTheDocument();
  });

  it('shows the Hebrew "בטיפול" button', async () => {
    await setupWaiterI18n('he');
    raiseAt(30, 'tlv-t8');
    signInAs(db, 'waiter@zayit.demo');
    renderWaiter('/');
    const buttons = await screen.findAllByRole('button', { name: /^בטיפול: / });
    expect(buttons[0]).toHaveTextContent('בטיפול');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
