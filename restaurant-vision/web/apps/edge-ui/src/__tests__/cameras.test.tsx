// Camera credentials are write-only: sent once in their own fields, never rendered back.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n, unlockSetup } from '../test/utils';
import { sampleConfig } from './fixtures';

const { db, server } = createEdgeMockServer({ pin: '2468' });
const SECRET = 'Sup3r$ecret!';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  db.config = sampleConfig();
  db.cameras.clear();
  db.cameras.set('dining', {
    camera_id: 'dining',
    kind: 'rtsp',
    url: 'rtsp://admin:old-secret@192.168.1.64:554/Streaming/Channels/102',
    loop: true,
  });
  unlockSetup('2468');
});

describe('cameras step', () => {
  it('lists only redacted URLs and a "login saved" note', async () => {
    renderEdge('/setup/cameras');
    const list = await screen.findByRole('list', { name: 'Cameras' });
    expect(await within(list).findByText('rtsp://***@192.168.1.64:554/Streaming/Channels/102')).toBeInTheDocument();
    expect(within(list).getByText('Login saved')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('old-secret');
  });

  it('adds a camera from the brand template; the password is sent once and never shown again', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/cameras');
    await screen.findByRole('list', { name: 'Cameras' });
    await user.click(screen.getByRole('button', { name: 'Add camera' }));
    const form = screen.getByRole('form', { name: 'New camera' });
    await user.type(within(form).getByLabelText('Name'), 'Entrance');
    await user.type(within(form).getByLabelText('IP address or host'), '192.168.1.70');
    await user.type(within(form).getByLabelText('User name'), 'admin');
    await user.type(within(form).getByLabelText('Password'), SECRET);
    // The preview never contains credentials.
    expect(within(form).getByText('rtsp://***@192.168.1.70:554/Streaming/Channels/102')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Add camera' }));

    await waitFor(() => expect(db.cameras.has('entrance')).toBe(true));
    // The edge merged the credentials into its stored URL; the UI sent them separately.
    expect(db.cameras.get('entrance')!.url).toBe(
      `rtsp://admin:${encodeURIComponent(SECRET)}@192.168.1.70:554/Streaming/Channels/102`,
    );
    await waitFor(() => expect(db.config!.cameras.map((c) => c.name)).toEqual(['Dining room', 'Entrance']));
    expect(await screen.findByText('rtsp://***@192.168.1.70:554/Streaming/Channels/102')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New camera' })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(encodeURIComponent(SECRET));

    // Editing starts with empty credential fields.
    await user.click(screen.getByRole('button', { name: 'Edit Entrance' }));
    const edit = screen.getByRole('form', { name: 'Edit camera' });
    expect(within(edit).getByLabelText('User name')).toHaveValue('');
    expect(within(edit).getByLabelText('Password')).toHaveValue('');
    expect(within(edit).getByLabelText('IP address or host')).toHaveValue('192.168.1.70');
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('changes only the password: the stored address is kept', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/cameras');
    await user.click(await screen.findByRole('button', { name: 'Edit Dining room' }));
    const edit = screen.getByRole('form', { name: 'Edit camera' });
    await user.type(within(edit).getByLabelText('User name'), 'viewer');
    await user.type(within(edit).getByLabelText('Password'), 'n3w');
    await user.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(db.cameras.get('dining')!.url).toBe('rtsp://viewer:n3w@192.168.1.64:554/Streaming/Channels/102'),
    );
    expect(document.body.innerHTML).not.toContain('n3w');
  });

  it('deletes a camera and its zones after confirmation', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/cameras');
    await user.click(await screen.findByRole('button', { name: 'Delete Dining room' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete “Dining room” and its 1 zone?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(db.cameras.has('dining')).toBe(false));
    await waitFor(() => expect(db.config!.cameras).toEqual([]));
    expect(db.config!.zones).toEqual([]);
  });
});
