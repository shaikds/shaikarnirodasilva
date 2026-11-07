import {
  Card,
  PageHeader,
  StatTile,
  intlLocale,
  useMetricsSummary,
  useTableStats,
  useTimeseries,
  useTranslation,
  type Bucket,
  type Timeseries,
} from '@rv/shared';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ColumnChart, LineAreaChart, type ChartDatum } from '../components/charts';
import { RangePicker } from '../components/RangePicker';
import { useRange, type RangeKey } from '../lib/range';
import { byHourOfDay } from '../lib/series';
import { useFmt } from '../lib/useFmt';
import { useSiteMeta } from '../lib/useSiteMeta';

function useBucketLabel(bucket: Bucket, timeZone: string) {
  const { i18n } = useTranslation();
  const lng = i18n.language === 'en' ? 'en' : 'he';
  const fmt =
    bucket === '1d'
      ? new Intl.DateTimeFormat(intlLocale(lng), { day: 'numeric', month: 'numeric', timeZone })
      : new Intl.DateTimeFormat(intlLocale(lng), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
  return (ts: number) => fmt.format(new Date(ts * 1000));
}

export function AnalyticsPage() {
  const { siteId } = useParams();
  const { t } = useTranslation();
  const f = useFmt();
  const meta = useSiteMeta(siteId);
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const range = useRange(rangeKey, meta.timezone);
  const bucket: Bucket = rangeKey === 'today' ? '1h' : '1d';
  const label = useBucketLabel(bucket, meta.timezone);

  const summary = useMetricsSummary(siteId, range);
  const occupancy = useTimeseries(siteId, { metric: 'occupancy', bucket: '1h', ...range });
  const queue = useTimeseries(siteId, { metric: 'queue', bucket, ...range });
  const walkaways = useTimeseries(siteId, { metric: 'walkaways', bucket, ...range });
  const response = useTimeseries(siteId, { metric: 'response_time', bucket, ...range });
  const tables = useTableStats(siteId, range);

  const toData = (s: Timeseries | undefined, scale = 1): ChartDatum[] =>
    (s?.points ?? []).map((p) => ({
      label: label(p.ts),
      value: p.value === null ? null : Math.round((p.value / scale) * 10) / 10,
    }));
  const tableData = (pick: (row: NonNullable<typeof tables.data>[number]) => number | null): ChartDatum[] =>
    (tables.data ?? []).map((r) => ({ label: r.label, value: pick(r) }));

  const s = summary.data;
  const minutes = (v: number) => f.number(v, 1);
  const count = (v: number) => f.number(v, 1);

  return (
    <>
      <PageHeader title={t('analytics.title')} subtitle={meta.name} actions={<RangePicker value={rangeKey} onChange={setRangeKey} />} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title={t('analytics.occupancyByHour')} description={t('analytics.occupancyDesc')}>
          <ColumnChart
            data={byHourOfDay(occupancy.data, meta.timezone)}
            seriesName={t('analytics.guests')}
            categoryName={t('analytics.hour')}
            format={count}
            dimmed={occupancy.isPlaceholderData}
          />
        </Card>

        <Card title={t('analytics.responseTitle')} description={t('analytics.responseDesc')}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <StatTile label={t('analytics.p50')} value={f.dur(s?.waiter_response_p50_s)} />
            <StatTile label={t('analytics.p90')} value={f.dur(s?.waiter_response_p90_s)} />
          </div>
          <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.medianOverTime')}</h3>
          <LineAreaChart
            data={toData(response.data, 60)}
            seriesName={t('analytics.p50')}
            categoryName={t('analytics.when')}
            format={minutes}
            height={200}
            dimmed={response.isPlaceholderData}
          />
        </Card>

        <Card title={t('analytics.queueTitle')} description={t('analytics.queueDesc')} className="xl:col-span-2">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label={t('analytics.avgWait')} value={f.dur(s?.queue_avg_wait_s)} />
            <StatTile label={t('analytics.maxWait')} value={f.dur(s?.queue_max_wait_s)} />
            <StatTile label={t('analytics.walkawaysTotal')} value={f.num(s?.walkaways)} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.queuePeople')}</h3>
              <LineAreaChart
                data={toData(queue.data)}
                seriesName={t('analytics.queuePeople')}
                categoryName={t('analytics.when')}
                format={count}
                height={200}
                dimmed={queue.isPlaceholderData}
              />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.walkaways')}</h3>
              <ColumnChart
                data={toData(walkaways.data)}
                seriesName={t('analytics.walkaways')}
                categoryName={t('analytics.when')}
                format={(v) => f.number(v)}
                height={200}
                dimmed={walkaways.isPlaceholderData}
              />
            </div>
          </div>
        </Card>

        <Card title={t('analytics.tablesTitle')} description={t('analytics.tablesDesc')} className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div>
              <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.sessions')}</h3>
              <ColumnChart
                data={tableData((r) => r.sessions)}
                seriesName={t('analytics.sessions')}
                categoryName={t('report.columns.table')}
                format={(v) => f.number(v)}
                height={220}
                dimmed={tables.isPlaceholderData}
              />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.avgDwellMin')}</h3>
              <ColumnChart
                data={tableData((r) => (r.avg_dwell_s === null ? null : Math.round(r.avg_dwell_s / 60)))}
                seriesName={t('analytics.avgDwellMin')}
                categoryName={t('report.columns.table')}
                format={(v) => f.number(v)}
                height={220}
                dimmed={tables.isPlaceholderData}
              />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.firstVisitByTable')}</h3>
              <ColumnChart
                data={tableData((r) =>
                  r.first_visit_delay_p50_s === null ? null : Math.round((r.first_visit_delay_p50_s / 60) * 10) / 10,
                )}
                seriesName={t('analytics.firstVisitByTable')}
                categoryName={t('report.columns.table')}
                format={minutes}
                height={220}
                dimmed={tables.isPlaceholderData}
              />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
