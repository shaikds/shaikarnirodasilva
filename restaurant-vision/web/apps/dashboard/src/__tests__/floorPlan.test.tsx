import { TABLE_STATES, type TableLive } from '@rv/shared';
import { TestProviders } from '@rv/shared/test-utils';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FloorList, FloorPlan } from '../components/FloorPlan';
import { layoutTables } from '../lib/floorLayout';
import { setupDashboardI18n } from '../test/utils';

const NOW = 1_800_000_000;
const tables: TableLive[] = TABLE_STATES.map((state, i) => ({
  table_id: `t${i + 1}`,
  label: String(i + 1),
  seats: 4,
  state,
  guest_count: state === 'seated' || state === 'attended' ? 3 : 0,
  since_ts: NOW - 240,
  open_alert_ids: state === 'seated' ? ['a1'] : [],
}));
const layout = tables.map((t, i) => ({ table_id: t.table_id, x: i * 2, y: 0, w: 1, h: 1 }));

describe('FloorPlan', () => {
  beforeEach(() => setupDashboardI18n('en'));

  it('renders every table state with an accessible label', () => {
    render(<FloorPlan tables={tables} layout={layout} now={NOW} siteName="Tel Aviv" />, {
      wrapper: TestProviders,
    });
    expect(
      screen.getByRole('group', { name: 'Floor plan of Tel Aviv: 4 tables' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Table 1: Empty. 0 guests. for 4 min' }),
    ).toHaveAttribute('data-state', 'empty');
    expect(
      screen.getByRole('img', { name: 'Table 2: Seated. 3 guests. for 4 min. 1 open alert' }),
    ).toHaveAttribute('data-state', 'seated');
    expect(
      screen.getByRole('img', { name: 'Table 3: Attended. 3 guests. for 4 min' }),
    ).toHaveAttribute('data-state', 'attended');
    expect(
      screen.getByRole('img', { name: 'Table 4: Needs bussing. 0 guests. for 4 min' }),
    ).toHaveAttribute('data-state', 'needs_bussing');
  });

  it('colors each state with its own token and shows label, guests and timer', () => {
    const { container } = render(
      <FloorPlan tables={tables} layout={layout} now={NOW} siteName="x" />,
      { wrapper: TestProviders },
    );
    const fills = TABLE_STATES.map((s) =>
      container.querySelector(`[data-state="${s}"] rect`)!.getAttribute('style'),
    );
    expect(fills[0]).toContain('--rv-state-empty-bg');
    expect(fills[1]).toContain('--rv-state-seated-bg');
    expect(fills[2]).toContain('--rv-state-attended-bg');
    expect(fills[3]).toContain('--rv-state-bussing-bg');
    const seated = container.querySelector('[data-state="seated"]') as HTMLElement;
    expect(within(seated).getByText('2')).toBeInTheDocument();
    expect(within(seated).getByText('3')).toBeInTheDocument();
    expect(within(seated).getByText('4:00')).toBeInTheDocument();
    expect(seated.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('labels tables in Hebrew and mirrors the grid in RTL', async () => {
    await setupDashboardI18n('he');
    const { container } = render(
      <FloorPlan
        tables={tables.slice(0, 1)}
        layout={[{ table_id: 't1', x: 0, y: 0, w: 1, h: 1 }]}
        now={NOW}
        siteName="תל אביב"
      />,
      {
        wrapper: TestProviders,
      },
    );
    expect(screen.getByRole('img', { name: /^שולחן 1: פנוי/ })).toBeInTheDocument();
    // x = 0 is the start edge, i.e. the right-most column (6 columns min, 100 units each).
    expect(container.querySelector('rect')!.getAttribute('x')).toBe('506');
  });

  it('places tables missing from the floor plan below the plan', () => {
    const r = layoutTables(tables, layout.slice(0, 2));
    expect(r.unplacedCount).toBe(2);
    const unplaced = r.items.filter((i) => !i.placed);
    expect(unplaced.every((i) => i.y >= 2)).toBe(true);
  });

  it('list view shows state chips with text', () => {
    render(<FloorList tables={tables} now={NOW} />, { wrapper: TestProviders });
    for (const label of ['Empty', 'Seated', 'Attended', 'Needs bussing'])
      expect(screen.getByText(label)).toBeInTheDocument();
  });
});
