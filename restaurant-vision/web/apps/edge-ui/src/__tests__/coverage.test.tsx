// Coverage step: uncovered tables with reasons and the ceiling-camera recommendation.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n, unlockSetup } from '../test/utils';
import { sampleConfig } from './fixtures';

const { db, server } = createEdgeMockServer({ pin: '2468' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  await setupEdgeI18n('en');
  const base = sampleConfig();
  db.config = {
    ...base,
    tables: [...base.tables, { table_id: 't-3', label: '3', seats: 4, section: null }],
    zones: [
      ...base.zones,
      {
        zone_id: 'zone-table-3',
        camera_id: 'dining',
        kind: 'table',
        polygon: [
          [0.5, 0.5],
          [0.7, 0.5],
          [0.7, 0.8],
        ],
        line: null,
        table_id: 't-3',
        primary: false,
      },
    ],
  };
  unlockSetup('2468');
});

describe('coverage step', () => {
  it('lists uncovered tables with the reason and recommends a ceiling (fisheye) camera', async () => {
    renderEdge('/setup/coverage');
    const list = await screen.findByRole('list', { name: '2 tables are not counted' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Table 2');
    expect(rows[0]).toHaveTextContent('No camera sees this table yet.');
    expect(rows[1]).toHaveTextContent('Table 3');
    expect(rows[1]).toHaveTextContent('Drawn on “Dining room”, but not as its primary camera.');
    const reco = screen.getByRole('region', { name: 'How to cover the missing tables' });
    expect(reco).toHaveTextContent('Add a ceiling camera.');
    expect(reco).toHaveTextContent(/ceiling \(fisheye\) camera above this area/);
    expect(reco).toHaveTextContent('Or draw the table on another camera');
    expect(within(reco).getByRole('link', { name: 'Draw zones' })).toHaveAttribute('href', '/setup/zones');
    expect(screen.getByText('1 of 3 tables are counted. The others need attention.')).toBeInTheDocument();
  });

  it('fixes a non-primary drawing in one click', async () => {
    const user = userEvent.setup();
    renderEdge('/setup/coverage');
    await user.click(await screen.findByRole('button', { name: 'Count it on “Dining room”' }));
    await waitFor(() => expect(db.config!.zones.find((z) => z.zone_id === 'zone-table-3')!.primary).toBe(true));
    expect(await screen.findByRole('list', { name: '1 table is not counted' })).toBeInTheDocument();
  });

  it('says so when every table is counted', async () => {
    db.config = { ...sampleConfig(), tables: sampleConfig().tables.slice(0, 1) };
    renderEdge('/setup/coverage');
    expect(await screen.findByText('The table is counted by a camera.')).toBeInTheDocument();
    expect(screen.queryByText('Add a ceiling camera.')).not.toBeInTheDocument();
  });
});
