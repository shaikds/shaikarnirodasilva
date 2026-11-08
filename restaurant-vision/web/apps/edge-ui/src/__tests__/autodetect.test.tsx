// Zones step: "Auto-detect tables" (POST /local/cameras/{id}/suggest-tables, mocked).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SuggestNote } from '../api/types';
import { defaultSuggestions } from '../mock/db';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n, unlockSetup } from '../test/utils';
import { sampleConfig } from './fixtures';

const { db, server } = createEdgeMockServer({ pin: '2468' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  // Tables "1" and "2" exist; a third table is labelled "4" to check numbering gaps.
  const base = sampleConfig();
  db.config = { ...base, tables: [...base.tables, { table_id: 't-4', label: '4', seats: 2, section: null }] };
  db.suggestions = defaultSuggestions(); // 4 suggestions
  db.suggestNote = null;
  unlockSetup('2468');
});

async function detect() {
  const user = userEvent.setup();
  renderEdge('/setup/zones');
  await user.click(await screen.findByRole('button', { name: 'Auto-detect tables' }));
  return user;
}

const pending = () => screen.findByRole('list', { name: 'Suggested tables' });

describe('auto-detect tables', () => {
  it('shows the button with the "empty restaurant" hint and draws each suggestion with its confidence', async () => {
    renderEdge('/setup/zones');
    expect(await screen.findByRole('button', { name: 'Auto-detect tables' })).toBeInTheDocument();
    expect(screen.getByText('Works best when the restaurant is empty, before opening.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Auto-detect tables' }));
    const list = await pending();
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText('86% sure')).toBeInTheDocument();
    const outlines = screen.getByTestId('suggestions');
    expect(outlines.querySelectorAll('[data-suggestion-id]')).toHaveLength(4);
    expect(outlines).toHaveTextContent('86%');
    expect(outlines.querySelector('path')?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('accepting one creates the next free table number with the estimated seats and a primary zone', async () => {
    const user = await detect();
    const list = await pending();
    await user.click(within(list).getByRole('button', { name: 'Accept Suggestion 3' }));
    // Labels 1, 2, 4 exist: the new table is "3", with suggestion 3's two seats.
    const added = await screen.findByRole('list', { name: '1 table added: check its number and seats' });
    expect(within(added).getByLabelText('Number or name of table 3')).toHaveValue('3');
    expect(within(added).getByLabelText('Seats at table 3')).toHaveValue(2);
    expect(within(await pending()).getAllByRole('listitem')).toHaveLength(3);
    // The label and seats stay editable inline.
    await user.clear(within(added).getByLabelText('Seats at table 3'));
    await user.type(within(added).getByLabelText('Seats at table 3'), '6');
    // Saved with Next; the zone is a primary table zone and a normal editable polygon.
    await user.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(db.config!.tables.map((t) => t.label)).toEqual(['1', '2', '4', '3']));
    const table = db.config!.tables.find((t) => t.label === '3')!;
    expect(table.seats).toBe(6);
    const zone = db.config!.zones.find((z) => z.table_id === table.table_id)!;
    expect(zone).toMatchObject({ kind: 'table', camera_id: 'dining', primary: true });
    expect(zone.polygon).toHaveLength(4);
  });

  it('"accept all" numbers every table without collisions', async () => {
    const user = await detect();
    await user.click(within(screen.getByRole('region', { name: 'Table suggestions' })).getByRole('button', { name: 'Accept all 4' }));
    expect(screen.queryByRole('list', { name: 'Suggested tables' })).not.toBeInTheDocument();
    const added = await screen.findByRole('list', { name: '4 tables added: check their numbers and seats' });
    const labels = within(added)
      .getAllByRole('spinbutton')
      .map((el) => el.getAttribute('aria-label'));
    expect(labels).toEqual(['Seats at table 3', 'Seats at table 5', 'Seats at table 6', 'Seats at table 7']);
    expect(screen.getByRole('list', { name: 'Zones on Dining room' }).querySelectorAll('li')).toHaveLength(5);
  });

  it('rejecting removes a suggestion without creating anything', async () => {
    const user = await detect();
    const list = await pending();
    await user.click(within(list).getByRole('button', { name: 'Reject Suggestion 1' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Reject all' }));
    expect(screen.queryByRole('list', { name: 'Suggested tables' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('suggestions')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Zones on Dining room' }).querySelectorAll('li')).toHaveLength(1);
  });

  it('explains when nothing was found and keeps manual drawing', async () => {
    db.suggestions = [];
    await detect();
    expect(await screen.findByTestId('suggest-none')).toHaveTextContent(
      'No tables were found in this picture. Tables may be hidden by people, too small or seen from a steep angle.',
    );
    expect(screen.getByRole('button', { name: 'Table' })).toBeEnabled();
  });

  it.each<[SuggestNote, string]>([
    ['simulated_camera', 'Auto-detect works on real cameras. This is a simulated camera, so draw the tables by hand.'],
    ['no_model', 'Auto-detect is not installed on this edge yet (no detection model). Draw the tables by hand.'],
    ['no_frame', 'The camera did not send a picture just now. Check the camera, refresh the picture and try again.'],
  ])('explains the "%s" note', async (note, text) => {
    db.suggestions = [];
    db.suggestNote = note;
    await detect();
    expect(await screen.findByTestId('suggest-note')).toHaveTextContent(text);
    expect(screen.getByTestId('suggest-none')).toHaveTextContent('You can still draw the tables by hand');
  });

  it('shows the Hebrew note for simulated cameras', async () => {
    await setupEdgeI18n('he');
    db.suggestions = [];
    db.suggestNote = 'simulated_camera';
    const user = userEvent.setup();
    renderEdge('/setup/zones');
    await user.click(await screen.findByRole('button', { name: 'זהה שולחנות אוטומטית' }));
    expect(await screen.findByTestId('suggest-note')).toHaveTextContent('הזיהוי האוטומטי עובד על מצלמות אמיתיות');
  });
});
