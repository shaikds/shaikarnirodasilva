// "Peak times & staffing" (contracts 1.3): guests per local hour (p75 of the last 4 weeks) and
// the recommended number of waiters, weekday vs weekend. Everything here is an estimate.
import {
  Card,
  EmptyState,
  EstimateBadge,
  StatTile,
  cn,
  useStaffing,
  useTranslation,
  type DayType,
} from '@rv/shared';
import { useState } from 'react';
import { ColumnChart, type ChartDatum } from './charts';
import { useFmt } from '../lib/useFmt';
import { weekdayName } from '../lib/weekdays';

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function StaffingCard({ siteId }: { siteId: string | undefined }) {
  const { t, i18n } = useTranslation();
  const f = useFmt();
  const staffing = useStaffing(siteId, 4);
  const [dayType, setDayType] = useState<DayType>('weekday');
  const report = staffing.data;
  const day = report?.days.find((d) => d.day_type === dayType);
  const open = (day?.hours ?? []).filter((h) => h.days > 0 && (h.peak_guests ?? 0) > 0);
  const data: ChartDatum[] = open.map((h) => ({
    label: hourLabel(h.hour),
    value: h.p75_guests === null ? null : Math.round(h.p75_guests),
  }));
  const busiest = open.reduce<(typeof open)[number] | null>(
    (best, h) => (best === null || (h.p75_guests ?? 0) > (best.p75_guests ?? 0) ? h : best),
    null,
  );
  const weekend = (report?.weekend_days ?? []).map((d) => weekdayName(d, i18n.language)).join(', ');

  return (
    <Card
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          {t('analytics.staffing.title')}
          <EstimateBadge />
        </span>
      }
      description={t('analytics.staffing.desc', { weekend })}
      className="xl:col-span-2"
      actions={
        <div
          role="group"
          aria-label={t('analytics.staffing.toggle')}
          className="inline-flex rounded-lg border border-border bg-surface p-0.5"
        >
          {(['weekday', 'weekend'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={dayType === v}
              onClick={() => setDayType(v)}
              className={cn(
                'min-h-[36px] rounded-md px-3 text-sm font-medium',
                dayType === v ? 'bg-primary text-primary-fg' : 'hover:bg-surface-2',
              )}
            >
              {t(`analytics.staffing.${v}`)}
            </button>
          ))}
        </div>
      }
    >
      {report && open.length === 0 ? (
        <EmptyState title={t('analytics.staffing.noData')} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label={t('analytics.staffing.busiest')}
              value={busiest ? hourLabel(busiest.hour) : f.none}
              hint={
                busiest
                  ? t('analytics.staffing.busiestHint', {
                      guests: f.number(busiest.p75_guests ?? 0),
                      waiters: busiest.recommended_waiters,
                    })
                  : undefined
              }
            />
            <StatTile
              label={t('analytics.staffing.maxWaiters')}
              value={f.num(
                open.length ? Math.max(...open.map((h) => h.recommended_waiters)) : null,
              )}
              estimate
            />
          </div>
          <h3 className="mb-1 text-sm font-medium text-muted">{t('analytics.staffing.guests')}</h3>
          <ColumnChart
            data={data}
            seriesName={t('analytics.staffing.guestsSeries')}
            categoryName={t('analytics.hour')}
            format={(v) => f.number(v)}
            height={220}
            dimmed={staffing.isPlaceholderData}
          />
          <h3 className="mb-2 mt-4 text-sm font-medium text-muted">
            {t('analytics.staffing.waitersPerHour')}
          </h3>
          <ol
            className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12"
            aria-label={t('analytics.staffing.waitersPerHour')}
          >
            {open.map((h) => (
              <li
                key={h.hour}
                data-testid={`waiters-${h.hour}`}
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-center"
              >
                <span className="block text-xs text-muted rv-num">{hourLabel(h.hour)}</span>
                <span className="block text-lg font-bold rv-num">{h.recommended_waiters}</span>
                <span className="sr-only">{t('analytics.staffing.waiters')}</span>
              </li>
            ))}
          </ol>
          {report && (
            <p className="mt-3 text-xs text-muted">
              {t('analytics.staffing.assumption', {
                count: report.guests_per_waiter,
                weeks: report.weeks,
              })}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
