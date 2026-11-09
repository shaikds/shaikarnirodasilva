import { signInAs, signOut } from '@rv/shared/test-utils';
import { createMockServer } from '@rv/shared/mock/node';
import type { ShiftReport } from '@rv/shared';
import { TestProviders } from '@rv/shared/test-utils';
import { render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReportPage, RoiSection } from '../pages/ReportPage';
import { renderRoute, setupDashboardI18n } from '../test/utils';

const { db, server } = createMockServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  signOut();
});
afterAll(() => server.close());
beforeEach(() => setupDashboardI18n('en'));

const est = (value: number | null) => ({ value, is_estimate: true as const });

const report: ShiftReport = {
  site_id: 'site-tlv',
  date: '2026-11-05',
  timezone: 'Asia/Jerusalem',
  from_ts: 1_793_000_000,
  to_ts: 1_793_086_400,
  summary: {
    site_id: 'site-tlv',
    from_ts: 1_793_000_000,
    to_ts: 1_793_086_400,
    currency: 'ILS',
    sessions: 80,
    guests_served: 210,
    avg_dwell_s: 3300,
    turnover_per_table: 5.7,
    waiter_response_p50_s: 95,
    waiter_response_p90_s: 240,
    bussing_delay_p50_s: 150,
    queue_avg_wait_s: 280,
    queue_max_wait_s: 1100,
    walkaways: 6,
    lost_revenue: est(2088),
  },
  tables: [],
  occupancy_by_hour: [],
  roi: {
    is_estimate: true,
    currency: 'ILS',
    avg_check_per_guest: 145,
    walkaways: 6,
    lost_revenue: est(2088),
    response_time_baseline_p50_s: 190,
    response_time_current_p50_s: 95,
    response_time_improvement_s: est(95),
    extra_covers: est(9),
    extra_revenue: est(1305),
  },
};

describe('ROI estimates', () => {
  it('badges every ROI number as an estimate and explains the method', () => {
    render(<RoiSection report={report} />, { wrapper: TestProviders });
    const names = [
      'Revenue lost to walk-aways',
      'Faster first visit',
      'Extra guests served',
      'Extra revenue',
    ];
    for (const name of names) {
      const tile = screen.getByRole('group', { name });
      expect(within(tile).getByText('Estimate')).toBeInTheDocument();
      expect(tile.querySelector('[data-estimate="true"]')).not.toBeNull();
    }
    const lost = screen.getByRole('group', { name: 'Revenue lost to walk-aways' });
    expect(lost).toHaveTextContent('₪2,088');
    expect(lost).toHaveTextContent(
      'Walk-aways (6) × estimated party size × average check per guest (₪145).',
    );
    expect(screen.getByRole('group', { name: 'Faster first visit' })).toHaveTextContent(
      '2 min faster',
    );
  });

  it('uses the Hebrew badge text', async () => {
    await setupDashboardI18n('he');
    render(<RoiSection report={report} />, { wrapper: TestProviders });
    expect(screen.getAllByText('הערכה')).toHaveLength(4);
  });

  it('says "not enough data" instead of a number when an estimate is null', () => {
    const empty = {
      ...report,
      roi: { ...report.roi, extra_covers: est(null), extra_revenue: est(null) },
    };
    render(<RoiSection report={empty} />, { wrapper: TestProviders });
    const covers = screen.getByRole('group', { name: 'Extra guests served' });
    expect(covers).toHaveTextContent('Not enough data');
    expect(within(covers).getByText('Estimate')).toBeInTheDocument();
  });

  it('the shift report page loads from the API with all estimates badged', async () => {
    signInAs(db, 'demo@example.com');
    renderRoute(<ReportPage />, '/sites/site-tlv/report', '/sites/:siteId/report');
    const roi = await screen.findByTestId('roi');
    expect(within(roi).getAllByText('Estimate')).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Shift report' })).toBeInTheDocument();
  });
});
