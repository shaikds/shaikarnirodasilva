// Schematic SVG floor plan from `SiteSettings.floor_plan` (grid cells, x from the start edge).
// Tables are colored by state and always carry an icon, label, guest count and timer, plus an
// accessible name. Camera imagery never appears here.
import {
  TABLE_STATE_STYLE,
  TableStateChip,
  TABLE_STATES,
  directionOf,
  formatElapsed,
  useFormatters,
  useTranslation,
  type FloorPlanItem,
  type TableLive,
} from '@rv/shared';
import { Users } from 'lucide-react';
import { layoutTables } from '../lib/floorLayout';

const CELL = 100;
const GAP = 12;

/** Elapsed display: a stopwatch where waiting matters, a compact duration otherwise. */
function useTimerText() {
  const f = useFormatters();
  return (t: TableLive, now: number): string | null => {
    if (t.since_ts === null) return null;
    const s = Math.max(0, now - t.since_ts);
    return t.state === 'seated' || t.state === 'needs_bussing' ? formatElapsed(s) : f.duration(s);
  };
}

function useTableAriaLabel() {
  const { t } = useTranslation();
  const f = useFormatters();
  return (table: TableLive, now: number): string => {
    const base = t('live.tableAria', {
      name: t('common:table.name', { label: table.label }),
      state: t(`common:tableState.${table.state}`),
      guests: t('common:table.guests', { count: table.guest_count }),
      since:
        table.since_ts === null
          ? t('live.unknownSince')
          : t('common:table.since', { duration: f.duration(Math.max(0, now - table.since_ts)) }),
    });
    const alerts = table.open_alert_ids.length;
    return alerts ? `${base}. ${t('live.tableAlerts', { count: alerts })}` : base;
  };
}

export interface FloorPlanProps {
  tables: TableLive[];
  layout: FloorPlanItem[];
  now: number;
  siteName: string;
}

export function FloorPlan({ tables, layout, now, siteName }: FloorPlanProps) {
  const { t, i18n } = useTranslation();
  const rtl = directionOf(i18n.language) === 'rtl';
  const timerText = useTimerText();
  const ariaLabel = useTableAriaLabel();
  const { items, cols, rows } = layoutTables(tables, layout);
  const width = cols * CELL;
  const height = Math.max(1, rows) * CELL;

  return (
    // Scrolls inside the card on narrow screens: cells never shrink below ~56 px.
    <div className="-mx-4 overflow-x-auto px-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={t('live.floorPlanAria', { site: siteName, count: tables.length })}
        className="h-auto w-full select-none"
        style={{ minWidth: cols * 56, maxHeight: '70vh' }}
      >
        {items.map(({ table, x, y, w, h, placed }) => {
          const style = TABLE_STATE_STYLE[table.state];
          const Icon = style.icon;
          const col = rtl ? cols - x - w : x;
          const rx = col * CELL + GAP / 2;
          const ry = y * CELL + GAP / 2;
          const rw = w * CELL - GAP;
          const rh = h * CELL - GAP;
          const cx = rx + rw / 2;
          // Rows: label, guests, timer; clear of the corner icon and alert badge.
          const labelY = h > 1 ? ry + rh / 2 - 6 : ry + 48;
          const guestsY = labelY + 20;
          const timer = timerText(table, now);
          const alerts = table.open_alert_ids.length;
          const iconX = rtl ? rx + rw - 26 : rx + 8;
          const badgeX = rtl ? rx + 14 : rx + rw - 14;
          return (
            <g
              key={table.table_id}
              role="img"
              aria-label={ariaLabel(table, now)}
              tabIndex={0}
              data-state={table.state}
              data-table-id={table.table_id}
              className="cursor-default"
            >
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                rx={14}
                style={{ fill: style.fill, stroke: style.stroke }}
                strokeWidth={table.state === 'empty' ? 2 : 3}
                strokeDasharray={placed ? undefined : '6 4'}
              />
              <Icon
                x={iconX}
                y={ry + 7}
                width={16}
                height={16}
                style={{ color: style.text }}
                aria-hidden="true"
              />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fontSize={20}
                fontWeight={700}
                style={{ fill: style.text }}
              >
                {table.label}
              </text>
              {table.state !== 'empty' && table.state !== 'needs_bussing' && (
                <g aria-hidden="true">
                  <Users
                    x={cx - 20}
                    y={guestsY - 12}
                    width={13}
                    height={13}
                    style={{ color: style.text }}
                  />
                  <text
                    x={cx + 2}
                    y={guestsY}
                    textAnchor="start"
                    fontSize={14}
                    fontWeight={600}
                    style={{ fill: style.text }}
                    direction="ltr"
                  >
                    {table.guest_count}
                  </text>
                </g>
              )}
              {timer && (
                <text
                  x={cx}
                  y={ry + rh - 8}
                  textAnchor="middle"
                  fontSize={12}
                  style={{ fill: style.text, fontVariantNumeric: 'tabular-nums' }}
                >
                  {timer}
                </text>
              )}
              {alerts > 0 && (
                <g aria-hidden="true">
                  <circle
                    cx={badgeX}
                    cy={ry + 14}
                    r={11}
                    style={{ fill: 'rgb(var(--rv-danger))' }}
                  />
                  <text
                    x={badgeX}
                    y={ry + 19}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={700}
                    style={{ fill: 'rgb(var(--rv-surface))' }}
                  >
                    {alerts}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function FloorLegend() {
  const { t } = useTranslation();
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2"
      aria-label={t('live.legend')}
      role="group"
    >
      {TABLE_STATES.map((s) => (
        <TableStateChip key={s} state={s} size="sm" />
      ))}
    </div>
  );
}

/** Same data as the plan, as a list (small screens, screen readers, preference). */
export function FloorList({ tables, now }: { tables: TableLive[]; now: number }) {
  const { t } = useTranslation();
  const timerText = useTimerText();
  return (
    <ul className="divide-y divide-border">
      {tables.map((table) => (
        <li key={table.table_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <span className="min-w-[4.5rem] font-semibold">
            {t('common:table.name', { label: table.label })}
          </span>
          <TableStateChip state={table.state} size="sm" />
          {table.state !== 'empty' && table.state !== 'needs_bussing' && (
            <span className="text-sm text-muted">
              {t('common:table.guests', { count: table.guest_count })}
            </span>
          )}
          <span className="ms-auto flex items-center gap-2 text-sm">
            {table.open_alert_ids.length > 0 && (
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                {t('live.tableAlerts', { count: table.open_alert_ids.length })}
              </span>
            )}
            <span className="rv-num text-muted">{timerText(table, now) ?? ''}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
