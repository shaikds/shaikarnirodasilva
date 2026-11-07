import {
  Button,
  Card,
  LoadingBlock,
  PageHeader,
  StatTile,
  TextField,
  todayIn,
  useShiftReport,
  useTranslation,
  zonedDayStart,
  type ShiftReport,
} from '@rv/shared';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ColumnChart } from '../components/charts';
import { byHourOfDay } from '../lib/series';
import { useFmt } from '../lib/useFmt';
import { useSiteMeta } from '../lib/useSiteMeta';

function Kpis({ report }: { report: ShiftReport }) {
  const { t } = useTranslation();
  const f = useFmt();
  const s = report.summary;
  return (
    <section aria-labelledby="kpi-title" className="mb-6">
      <h2 id="kpi-title" className="mb-3 text-base font-semibold">
        {t('report.kpiTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label={t('report.kpis.guests')} value={f.num(s.guests_served)} />
        <StatTile label={t('report.kpis.sessions')} value={f.num(s.sessions)} />
        <StatTile label={t('report.kpis.avgDwell')} value={f.dur(s.avg_dwell_s)} />
        <StatTile label={t('report.kpis.turnover')} value={f.num(s.turnover_per_table, 1)} />
        <StatTile label={t('report.kpis.walkaways')} value={f.num(s.walkaways)} />
        <StatTile label={t('report.kpis.responseP50')} value={f.dur(s.waiter_response_p50_s)} />
        <StatTile label={t('report.kpis.responseP90')} value={f.dur(s.waiter_response_p90_s)} />
        <StatTile label={t('report.kpis.bussing')} value={f.dur(s.bussing_delay_p50_s)} />
        <StatTile label={t('report.kpis.queueAvg')} value={f.dur(s.queue_avg_wait_s)} />
        <StatTile label={t('report.kpis.queueMax')} value={f.dur(s.queue_max_wait_s)} />
      </div>
    </section>
  );
}

/** ROI block (architecture 7.4): every number badged as an estimate with its method. */
export function RoiSection({ report }: { report: ShiftReport }) {
  const { t } = useTranslation();
  const f = useFmt();
  const roi = report.roi;
  const check = f.currency(roi.avg_check_per_guest, roi.currency);
  const improvement = roi.response_time_improvement_s.value;
  const durOr = (v: number | null) => (v === null ? t('report.roi.unknown') : f.duration(v));
  return (
    <Card title={t('report.roi.title')} description={t('report.roi.subtitle')} className="mb-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="roi">
        <StatTile
          label={t('report.roi.lostRevenue')}
          value={f.money(roi.lost_revenue.value, roi.currency)}
          estimate={{ method: t('report.roi.lostRevenueMethod', { walkaways: f.number(roi.walkaways), check }) }}
        />
        <StatTile
          label={t('report.roi.improvement')}
          value={
            improvement === null
              ? t('common:status.notEnoughData')
              : improvement >= 0
                ? t('report.roi.improvementValue', { duration: f.duration(improvement) })
                : t('report.roi.improvementSlower', { duration: f.duration(-improvement) })
          }
          tone={improvement !== null && improvement > 0 ? 'success' : 'default'}
          estimate={{
            method: t('report.roi.improvementMethod', {
              baseline: durOr(roi.response_time_baseline_p50_s),
              current: durOr(roi.response_time_current_p50_s),
            }),
          }}
        />
        <StatTile
          label={t('report.roi.extraCovers')}
          value={roi.extra_covers.value === null ? t('common:status.notEnoughData') : f.number(roi.extra_covers.value)}
          estimate={{ method: t('report.roi.extraCoversMethod') }}
        />
        <StatTile
          label={t('report.roi.extraRevenue')}
          value={f.money(roi.extra_revenue.value, roi.currency)}
          estimate={{ method: t('report.roi.extraRevenueMethod', { check }) }}
        />
      </div>
    </Card>
  );
}

function TablesTable({ report }: { report: ShiftReport }) {
  const { t } = useTranslation();
  const f = useFmt();
  const th = 'whitespace-nowrap px-3 py-2 text-start text-xs font-semibold text-muted';
  const td = 'rv-num whitespace-nowrap px-3 py-2 text-sm text-start';
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[40rem]">
        <caption className="sr-only">{t('report.tablesTitle')}</caption>
        <thead>
          <tr className="border-b border-border">
            {(['table', 'seats', 'sessions', 'guests', 'avgDwell', 'party', 'firstVisit', 'bussing'] as const).map((c) => (
              <th key={c} scope="col" className={th}>
                {t(`report.columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.tables.map((r) => (
            <tr key={r.table_id} className="border-b border-border last:border-0">
              <th scope="row" className="px-3 py-2 text-start text-sm font-medium">
                {r.label}
              </th>
              <td className={td}>{f.num(r.seats)}</td>
              <td className={td}>{f.num(r.sessions)}</td>
              <td className={td}>{f.num(r.guests)}</td>
              <td className={td}>{f.dur(r.avg_dwell_s)}</td>
              <td className={td}>{f.num(r.avg_party_size, 1)}</td>
              <td className={td}>{f.dur(r.first_visit_delay_p50_s)}</td>
              <td className={td}>{f.dur(r.bussing_delay_p50_s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportPage() {
  const { siteId } = useParams();
  const { t } = useTranslation();
  const f = useFmt();
  const meta = useSiteMeta(siteId);
  const today = todayIn(meta.timezone);
  const [date, setDate] = useState(today);
  const report = useShiftReport(siteId, date);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <>
      <PageHeader
        title={t('report.title')}
        subtitle={validDate ? t('report.subtitle', { site: meta.name, date: f.date(zonedDayStart(date, meta.timezone) + 12 * 3600, meta.timezone, 'long') }) : meta.name}
        actions={
          <>
            <TextField
              label={t('report.date')}
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              containerClassName="w-44"
              className="min-h-[40px]"
            />
            <Button variant="secondary" className="self-end print:hidden" onClick={() => window.print()}>
              <Printer aria-hidden="true" className="h-4 w-4" />
              {t('report.print')}
            </Button>
          </>
        }
      />
      {report.isLoading || !report.data ? (
        report.isError ? (
          <p role="alert" className="text-danger">
            {t('common:errors.generic')}
          </p>
        ) : (
          <LoadingBlock />
        )
      ) : (
        <div className={report.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Kpis report={report.data} />
          <RoiSection report={report.data} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title={t('report.occupancyTitle')}>
              <ColumnChart
                data={byHourOfDay(
                  {
                    site_id: report.data.site_id,
                    metric: 'occupancy',
                    bucket: '1h',
                    from_ts: report.data.from_ts,
                    to_ts: report.data.to_ts,
                    points: report.data.occupancy_by_hour,
                  },
                  report.data.timezone,
                )}
                seriesName={t('analytics.guests')}
                categoryName={t('analytics.hour')}
                format={(v) => f.number(v, 1)}
              />
            </Card>
            <Card title={t('report.tablesTitle')}>
              <TablesTable report={report.data} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
