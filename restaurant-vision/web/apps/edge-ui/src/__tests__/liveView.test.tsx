// Live view (contracts 1.3): PIN gate, camera tabs, the MJPEG stream URL and the colour legend;
// the "table freed" alert on the offline alerts page.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPin } from '../api/pin';
import { LIVE_STATE_COLORS } from '../lib/liveColors';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n, unlockSetup } from '../test/utils';
import { sampleConfig } from './fixtures';

vi.mock('../lib/sound', () => ({
  playBeep: vi.fn(() => true),
  vibrate: vi.fn(() => true),
  audioLocked: () => false,
  installAudioUnlock: () => () => undefined,
}));

const { db, server } = createEdgeMockServer({ pin: '2468' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearPin();
});
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  db.config = sampleConfig();
  db.cameras.clear();
  db.cameras.set('dining', { camera_id: 'dining', kind: 'rtsp', url: 'rtsp://h/s', loop: true });
  db.cameras.set('door', { camera_id: 'door', kind: 'rtsp', url: 'rtsp://h/d', loop: true });
});

describe('live view', () => {
  it('asks for the setup PIN, then streams the chosen camera with the PIN as a query', async () => {
    renderEdge('/live');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Setup PIN'), '2468');
    await user.click(screen.getByRole('button', { name: 'Show live view' }));
    const tabs = await screen.findByRole('tablist', { name: 'Cameras' });
    const [first, second] = within(tabs).getAllByRole('tab');
    expect(first).toHaveAttribute('aria-selected', 'true');
    const img = screen.getByTestId('live-stream');
    const src = new URL(img.getAttribute('src')!);
    expect(src.pathname).toBe(
      `/local/cameras/${first!.textContent === 'door' ? 'door' : 'dining'}/live.mjpeg`,
    );
    expect(src.searchParams.get('pin')).toBe('2468');
    await user.click(second!);
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('live-stream').getAttribute('src')).not.toBe(img.getAttribute('src'));
  });

  it('shows the colour legend matching the edge overlay and a retry on stream errors', async () => {
    unlockSetup('2468');
    renderEdge('/live');
    const legend = await screen.findByRole('list', { name: 'Table colours' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Empty', 'Seated', 'Attended', 'Needs bussing']);
    expect(screen.getByTestId('legend-needs_bussing')).toHaveStyle({
      backgroundColor: LIVE_STATE_COLORS.needs_bussing,
    });
    const img = screen.getByTestId('live-stream');
    img.dispatchEvent(new Event('error'));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    await userEvent.setup().click(retry);
    expect(screen.getByTestId('live-stream')).toBeInTheDocument();
  });

  it('is linked from the status home', async () => {
    renderEdge('/');
    expect(await screen.findByRole('link', { name: 'Live view' })).toHaveAttribute('href', '/live');
  });
});

describe('table freed on the offline alerts page', () => {
  it('shows "Table N freed – needs cleaning" with its icon', async () => {
    db.alerts.clear();
    db.raiseAlert('table_freed', sampleConfig().tables[0]!.table_id, 'info');
    renderEdge('/local-alerts');
    const label = sampleConfig().tables[0]!.label;
    expect(await screen.findByText(`Table ${label} freed – needs cleaning`)).toBeInTheDocument();
    expect(screen.getByTestId('icon-table-freed')).toBeInTheDocument();
  });
});
