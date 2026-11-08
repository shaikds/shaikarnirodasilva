// Zones step end to end with the mock edge: draw a polygon on the snapshot, save, review errors.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n, unlockSetup } from '../test/utils';
import { sampleConfig } from './fixtures';

const { db, server } = createEdgeMockServer({ pin: '2468' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  db.config = sampleConfig();
  unlockSetup('2468');
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
});

describe('zones step', () => {
  it('shows the blurred snapshot, draws a queue polygon and saves the whole config', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/zones');
    expect(await screen.findByRole('img', { name: /Camera Dining room: still picture with people blurred/ })).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/),
    );
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    const canvas = screen.getByTestId('zone-canvas');
    for (const [x, y] of [
      [400, 40],
      [600, 40],
      [600, 160],
    ])
      fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' });
    await user.click(screen.getByRole('button', { name: 'Close shape' }));
    expect(screen.getByText('Queue added. Drag its points to adjust.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(db.config!.zones).toHaveLength(2));
    expect(db.config!.zones[1]).toMatchObject({
      kind: 'queue',
      camera_id: 'dining',
      polygon: [
        [0.625, 0.1111],
        [0.9375, 0.1111],
        [0.9375, 0.4444],
      ],
    });
    // Fields the wizard does not edit are preserved.
    expect(db.config!.thresholds.seat_confirm_s).toBe(12);
    expect(db.config!.modules.queue).toBe(false);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/setup/uniform'));
  });

  it('draws an entrance line and flips its direction', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/zones');
    await user.click(await screen.findByRole('button', { name: 'Entrance line' }));
    const canvas = screen.getByTestId('zone-canvas');
    fireEvent.pointerDown(canvas, { clientX: 320, clientY: 340, pointerId: 1, button: 0, pointerType: 'mouse' });
    fireEvent.pointerDown(canvas, { clientX: 320, clientY: 200, pointerId: 1, button: 0, pointerType: 'mouse' });
    await user.click(await screen.findByRole('button', { name: 'Flip direction' }));
    await user.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(db.config!.zones.some((z) => z.kind === 'entrance_line')).toBe(true));
    const line = db.config!.zones.find((z) => z.kind === 'entrance_line')!;
    expect(line.line).toEqual({ a: [0.5, 0.9444], b: [0.5, 0.5556], in_direction: 'right_to_left' });
    expect(line.polygon).toBeNull();
  });

  it('lists server validation errors line by line when a save is rejected', async () => {
    server.use(
      http.put('*/local/config', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'zones', 0], msg: "Value error, zone 'z': queue zones need a polygon; queue zones must not have a line", type: 'value_error' }] },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    db.config = { ...sampleConfig(), config_version: 1 };
    renderEdge('/setup/review');
    await screen.findByRole('heading', { name: 'Review and save' });
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
    // Go back to the tables step (stepper) and change a table.
    await user.click(screen.getByRole('button', { name: /Tables/ }));
    const seats = await screen.findByLabelText('Seats at table 1');
    await user.clear(seats);
    await user.type(seats, '5');
    // Leaving the step saves: the edge rejects it and the reasons are listed.
    await user.click(screen.getByRole('button', { name: /Save and continue/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The edge did not accept the changes');
    const details = within(alert).getByRole('list', { name: 'Details' });
    expect(within(details).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      "zones › 0zone 'z': queue zones need a polygon",
      'zones › 0queue zones must not have a line',
    ]);
  });
});
