// Waiter alert list against the MSW mock backend: order by age, anonymous ack, new-alert cues.
import { createMockServer } from '@rv/shared/mock/node';
import { formatTime } from '@rv/shared';
import { signInAs, signOut } from '@rv/shared/test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { playAlertSound, vibrate } from '../lib/sound';
import { renderWaiter, setupWaiterI18n } from '../test/utils';

const audio = vi.hoisted(() => ({ locked: false, unlock: null as null | (() => void) }));

vi.mock('../lib/sound', () => ({
  playAlertSound: vi.fn(() => true),
  vibrate: vi.fn(() => true),
  audioLocked: () => audio.locked,
  installAudioUnlock: (onUnlocked?: () => void) => {
    audio.unlock = onUnlocked ?? null;
    return () => undefined;
  },
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
  audio.locked = false;
  audio.unlock = null;
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
    signInAs(db, 'waiter@example.com');
    renderWaiter('/');
    const list = await screen.findByRole('list', { name: 'Open alerts' });
    expect(cardTitles(list)).toEqual(['Table 1', 'Table 2', 'Table 3']);
    const first = within(list).getAllByRole('article')[0]!;
    expect(first).toHaveTextContent('Bussing needed');
    expect(first).toHaveTextContent(/Waiting to be cleared 5:0\d/);
    const button = within(first).getByRole('button', { name: 'On it: Table 1 · Bussing needed' });
    expect(button).toHaveTextContent('On it');
    expect(button.className).toContain('min-h-[64px]');
  });

  it('acknowledges anonymously and moves the alert to "In progress"', async () => {
    db.openAlerts('site-tlv').forEach((a) => db.ack(a.alert_id));
    const fresh = raiseAt(30, 'tlv-t5');
    signInAs(db, 'waiter@example.com');
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
    signInAs(db, 'waiter@example.com');
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
    signInAs(db, 'waiter@example.com');
    renderWaiter('/');
    const buttons = await screen.findAllByRole('button', { name: /^בטיפול: / });
    expect(buttons[0]).toHaveTextContent('בטיפול');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('shows how long the guests have been waiting since they sat down', async () => {
    const table = db.sites.get('site-tlv')!.tables.get('tlv-t4')!;
    table.live.state = 'seated';
    table.live.since_ts = Date.now() / 1000 - 400; // seated 6:40 ago
    const seatedAt = table.live.since_ts;
    raiseAt(60, 'tlv-t4'); // the edge raised the alert 1:00 ago
    raiseAt(200, 'tlv-t2'); // no seating time known: from raised_at
    signInAs(db, 'waiter@example.com');
    renderWaiter('/');
    const list = await screen.findByRole('list', { name: 'Open alerts' });
    // Longest waiting guests first, although table 2's alert was raised earlier.
    const titles = cardTitles(list);
    expect(titles.indexOf('Table 4')).toBeLessThan(titles.indexOf('Table 2'));
    const first = within(list).getAllByRole('article')[titles.indexOf('Table 4')]!;
    expect(within(first).getByTestId('alert-waiting')).toHaveTextContent(
      /^Guests waiting 6:(39|4\d)/,
    );
    expect(first).toHaveTextContent(`since ${formatTime(seatedAt, 'en')}`);
    expect(first).toHaveAccessibleName(/Guests waiting for [67] min/);
  });

  it('keeps the sound row in place when audio unlocks, so the first "On it" tap lands', async () => {
    audio.locked = true;
    raiseAt(30, 'tlv-t9');
    signInAs(db, 'waiter@example.com');
    renderWaiter('/');
    const banner = await screen.findByTestId('sound-banner');
    expect(banner).toHaveTextContent('Tap anywhere to enable alert sounds');
    const button = await screen.findByRole('button', { name: 'On it: Table 9 · Waiter needed' });
    act(() => {
      audio.locked = false;
      audio.unlock?.(); // the same tap that presses "On it" unlocks audio
    });
    // Same element, still there: nothing above the button moved.
    expect(screen.getByTestId('sound-banner')).toBe(banner);
    expect(banner).toHaveTextContent('Alert sounds are on');
    expect(button).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(button);
    await waitFor(() => expect(db.acks.size).toBeGreaterThan(0));
  });
});
