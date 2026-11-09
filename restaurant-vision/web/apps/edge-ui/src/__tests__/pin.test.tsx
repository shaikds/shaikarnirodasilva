// Setup PIN: first-time creation, the X-Setup-Pin header, 401 (wrong / stale PIN) and 429.
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { storePin } from '../api/pin';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n } from '../test/utils';
import { sampleConfig } from './fixtures';

const { db, server } = createEdgeMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  db.pin = '2468';
  db.failures = 0;
  db.lockedUntil = 0;
  db.paired = false;
  db.config = sampleConfig();
  db.lastSetupHeaders = null;
});

const location = () => screen.getByTestId('location').textContent;

describe('setup PIN', () => {
  it('first time: creates the PIN, keeps it in sessionStorage only and moves on', async () => {
    db.pin = null;
    const user = userEvent.setup();
    renderEdge('/setup');
    await user.type(await screen.findByLabelText('New setup PIN'), '1357');
    await user.type(screen.getByLabelText('Repeat the PIN'), '1357');
    await user.click(screen.getByRole('button', { name: 'Set PIN and continue' }));
    await waitFor(() => expect(location()).toBe('/setup/pair'));
    expect(db.pin).toBe('1357');
    expect(window.sessionStorage.getItem('rv-edge-setup-pin')).toBe('1357');
    expect(window.localStorage.getItem('rv-edge-setup-pin')).toBeNull();
  });

  it('rejects mismatching PINs before calling the edge', async () => {
    db.pin = null;
    const user = userEvent.setup();
    renderEdge('/setup/pin');
    await user.type(await screen.findByLabelText('New setup PIN'), '1357');
    await user.type(screen.getByLabelText('Repeat the PIN'), '1358');
    await user.click(screen.getByRole('button', { name: 'Set PIN and continue' }));
    expect(await screen.findByText('The two PINs are different.')).toBeInTheDocument();
    expect(db.pin).toBeNull();
  });

  it('sends the PIN as X-Setup-Pin on setup calls once unlocked', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/pin');
    await user.type(await screen.findByLabelText('Setup PIN', { selector: 'input' }), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock setup' }));
    await waitFor(() => expect(location()).toBe('/setup/pair'));
    await waitFor(() => expect(db.lastSetupHeaders?.get('X-Setup-Pin')).toBe('2468'));
  });

  it('shows "wrong PIN" on a 401 and stays on the PIN step', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/pin');
    await user.type(await screen.findByLabelText('Setup PIN', { selector: 'input' }), '0000');
    await user.click(screen.getByRole('button', { name: 'Unlock setup' }));
    expect(await screen.findByText('Wrong PIN.')).toBeInTheDocument();
    expect(location()).toBe('/setup/pin');
    expect(window.sessionStorage.getItem('rv-edge-setup-pin')).toBeNull();
  });

  it('a stale stored PIN (401 on a setup call) sends the installer back to the PIN step', async () => {
    storePin('9999');
    window.sessionStorage.setItem('rv-edge-pair-skipped', '1');
    renderEdge('/setup/cameras');
    await waitFor(() => expect(location()).toBe('/setup/pin'));
    expect(
      await screen.findByText('The edge did not accept the saved PIN (it may have been changed). Enter it again.'),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem('rv-edge-setup-pin')).toBeNull();
  });

  it('explains the lockout after too many wrong PINs (429), counting down from Retry-After', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/pin');
    act(() => {
      db.lockedUntil = Date.now() + 12_000;
    });
    await user.type(await screen.findByLabelText('Setup PIN', { selector: 'input' }), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock setup' }));
    expect(await screen.findByText(/Too many wrong PINs\. Try again in 1[12] s\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock setup' })).toBeDisabled();
  });

  it('checks the PIN with GET /local/setup/pin-check (204)', async () => {
    const seen: string[] = [];
    const onRequest = ({ request }: { request: Request }) => {
      seen.push(new URL(request.url).pathname);
    };
    server.events.on('request:start', onRequest);
    const user = userEvent.setup();
    renderEdge('/setup/pin');
    await user.type(await screen.findByLabelText('Setup PIN', { selector: 'input' }), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock setup' }));
    await waitFor(() => expect(location()).toBe('/setup/pair'));
    server.events.removeListener('request:start', onRequest);
    expect(seen).toContain('/local/setup/pin-check');
    expect(seen.indexOf('/local/setup/pin-check')).toBeLessThan(
      seen.indexOf('/local/cameras') === -1 ? Infinity : seen.indexOf('/local/cameras'),
    );
  });
});
