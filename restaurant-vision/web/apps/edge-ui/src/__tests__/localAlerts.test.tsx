// Offline waiter page: oldest first, anonymous "On it", live updates, sound + vibration.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { playBeep, vibrate } from '../lib/sound';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n } from '../test/utils';
import { sampleConfig } from './fixtures';

vi.mock('../lib/sound', () => ({
  playBeep: vi.fn(() => true),
  vibrate: vi.fn(() => true),
  audioLocked: () => false,
  installAudioUnlock: () => () => undefined,
}));

let clock = Date.now() / 1000;
const { db, server } = createEdgeMockServer({ now: () => clock });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  clock = Date.now() / 1000;
  db.alerts.clear();
  db.acks.clear();
  const base = sampleConfig();
  db.config = {
    ...base,
    tables: [...base.tables, { table_id: 't-3', label: '3', seats: 4, section: null }],
  };
  vi.mocked(playBeep).mockClear();
  vi.mocked(vibrate).mockClear();
});

function raiseAt(secondsAgo: number, tableId: string | null, kind: 'waiter_needed' | 'long_queue' = 'waiter_needed') {
  clock = Date.now() / 1000 - secondsAgo;
  const alert = db.raiseAlert(kind, tableId);
  clock = Date.now() / 1000;
  return alert;
}

const titles = (list: HTMLElement) =>
  within(list)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('local alerts page', () => {
  it('shows the offline banner and open alerts oldest first with big "On it" buttons', async () => {
    raiseAt(30, 't-3');
    raiseAt(300, 't-1');
    raiseAt(120, null, 'long_queue');
    renderEdge('/local-alerts');
    expect(screen.getByRole('note', { name: 'Offline mode · restaurant network' })).toHaveTextContent(
      'They keep working without internet.',
    );
    const list = await screen.findByRole('list', { name: 'Open alerts' });
    expect(titles(list)).toEqual(['Table 1', 'Entrance', 'Table 3']);
    const first = within(list).getAllByRole('article')[0]!;
    expect(first).toHaveTextContent(/Waiting (4:5\d|5:0\d)/);
    const button = within(first).getByRole('button', { name: 'On it: Table 1 · Waiter needed' });
    expect(button.className).toContain('min-h-[64px]');
    // Once audio is unlocked the sound row stays (as "on"), so the list never jumps under a tap.
    expect(screen.getByText('Alert sounds are on.')).toBeInTheDocument();
  });

  it('acknowledges over the LAN (no identity) and moves the alert to "In progress"', async () => {
    const alert = raiseAt(60, 't-2');
    const user = userEvent.setup();
    renderEdge('/local-alerts');
    await user.click(await screen.findByRole('button', { name: 'On it: Table 2 · Waiter needed' }));
    const section = await screen.findByRole('region', { name: 'In progress' });
    await waitFor(() => expect(titles(section)).toEqual(['Table 2']));
    expect(db.acks.has(alert.alert_id)).toBe(true);
    expect(db.alerts.get(alert.alert_id)).toMatchObject({ status: 'acknowledged', ack_via: 'local' });
    expect(screen.getByText('All calm')).toBeInTheDocument();
  });

  it('drops an alert that was already resolved on the edge (404 on ack)', async () => {
    const alert = raiseAt(60, 't-1');
    const user = userEvent.setup();
    renderEdge('/local-alerts');
    const button = await screen.findByRole('button', { name: 'On it: Table 1 · Waiter needed' });
    db.alerts.delete(alert.alert_id); // resolved meanwhile, without telling the socket
    await user.click(button);
    expect(await screen.findByText('All calm')).toBeInTheDocument();
  });

  it('new alerts arrive over the socket with a beep and a vibration', async () => {
    renderEdge('/local-alerts');
    expect(await screen.findByText('All calm')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Live').length).toBeGreaterThan(0));
    act(() => {
      db.raiseAlert('waiter_needed', 't-3', 'urgent');
    });
    const list = await screen.findByRole('list', { name: 'Open alerts' });
    expect(titles(list)).toEqual(['Table 3']);
    expect(within(list).getByText('Urgent')).toBeInTheDocument();
    await waitFor(() => expect(playBeep).toHaveBeenCalledWith(true));
    expect(vibrate).toHaveBeenCalledWith(true);
    expect(screen.getByText('New alert: Table 3 · Waiter needed')).toBeInTheDocument();
  });
});
