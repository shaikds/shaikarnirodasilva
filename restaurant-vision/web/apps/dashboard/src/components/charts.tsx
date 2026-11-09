// Chart kit (recharts) following the dataviz rules: one measure per chart (never two
// y-axes), single-series charts carry no legend (the title names them), bars <= 24px with
// 4px rounded data ends, 2px lines with a 10% area wash, hairline solid gridlines, a hover
// tooltip (keyboard-reachable via recharts' accessibility layer) and a table view.
// Two series of the same measure (e.g. response time p50 and p90) share one axis in
// `MultiLineChart`, with a legend, categorical slots 1-2 (validated pair) and a dashed second
// line so identity never rests on colour alone.
import { cn, directionOf, useThemeStore, useTranslation } from '@rv/shared';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

export interface ChartDatum {
  /** Category or time label shown on the axis and in the tooltip. */
  label: string;
  value: number | null;
}

interface ChartColors {
  series: string;
  series2: string;
  grid: string;
  axis: string;
  surface: string;
}

const FALLBACK: ChartColors = {
  series: '#2a78d6',
  series2: '#eb6834',
  grid: '#e5e7eb',
  axis: '#6b7280',
  surface: '#ffffff',
};

function readVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? `rgb(${v})` : fallback;
  } catch {
    return fallback;
  }
}

/** Resolved token colors (SVG attributes cannot rely on CSS variables everywhere). */
function useChartColors(): ChartColors {
  const mode = useThemeStore((s) => s.mode);
  const [colors, setColors] = useState<ChartColors>(FALLBACK);
  useEffect(() => {
    const update = () =>
      setColors({
        series: readVar('--rv-chart-1', FALLBACK.series),
        series2: readVar('--rv-chart-2', FALLBACK.series2),
        grid: readVar('--rv-chart-grid', FALLBACK.grid),
        axis: readVar('--rv-chart-axis', FALLBACK.axis),
        surface: readVar('--rv-surface', FALLBACK.surface),
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [mode]);
  return colors;
}

function useRtl(): boolean {
  const { i18n } = useTranslation();
  return directionOf(i18n.language) === 'rtl';
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
  seriesName,
  color,
  rtl,
}: TooltipProps<number, string> & {
  format: (v: number) => string;
  seriesName: string;
  color: string;
  rtl: boolean;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card"
    >
      <p className="text-base font-semibold">{typeof value === 'number' ? format(value) : '—'}</p>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-3 rounded"
          style={{ background: color }}
        />
        {seriesName} · {label}
      </p>
    </div>
  );
}

const axisTick = (color: string) => ({ fill: color, fontSize: 12 });

export interface SingleSeriesChartProps {
  data: ChartDatum[];
  /** Series name for the tooltip and table header. */
  seriesName: string;
  /** Header of the label column in the table view. */
  categoryName: string;
  format: (v: number) => string;
  height?: number;
  dimmed?: boolean;
}

export function ColumnChart({
  data,
  seriesName,
  categoryName,
  format,
  height = 240,
  dimmed,
}: SingleSeriesChartProps) {
  const c = useChartColors();
  const rtl = useRtl();
  return (
    <ChartFrame
      data={data}
      seriesName={seriesName}
      categoryName={categoryName}
      format={format}
      dimmed={dimmed}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
          <XAxis
            dataKey="label"
            reversed={rtl}
            tickLine={false}
            axisLine={{ stroke: c.grid }}
            tick={axisTick(c.axis)}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            tick={axisTick(c.axis)}
            width={44}
            allowDecimals={false}
            tickFormatter={(v: number) => format(v)}
          />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.5 }}
            content={
              <ChartTooltip format={format} seriesName={seriesName} color={c.series} rtl={rtl} />
            }
          />
          <Bar
            dataKey="value"
            name={seriesName}
            fill={c.series}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function LineAreaChart({
  data,
  seriesName,
  categoryName,
  format,
  height = 240,
  dimmed,
}: SingleSeriesChartProps) {
  const c = useChartColors();
  const rtl = useRtl();
  return (
    <ChartFrame
      data={data}
      seriesName={seriesName}
      categoryName={categoryName}
      format={format}
      dimmed={dimmed}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
          <XAxis
            dataKey="label"
            reversed={rtl}
            tickLine={false}
            axisLine={{ stroke: c.grid }}
            tick={axisTick(c.axis)}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            tick={axisTick(c.axis)}
            width={44}
            tickFormatter={(v: number) => format(v)}
          />
          <Tooltip
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
            content={
              <ChartTooltip format={format} seriesName={seriesName} color={c.series} rtl={rtl} />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={c.series}
            strokeWidth={2}
            fill={c.series}
            fillOpacity={0.1}
            connectNulls={false}
            dot={false}
            activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2, fill: c.series }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export interface MultiSeries {
  key: string;
  name: string;
}

export interface MultiDatum {
  label: string;
  values: Record<string, number | null>;
}

function MultiTooltip({
  active,
  payload,
  label,
  format,
  series,
  colors,
  rtl,
}: TooltipProps<number, string> & {
  format: (v: number) => string;
  series: MultiSeries[];
  colors: string[];
  rtl: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card"
    >
      <p className="mb-1 text-xs text-muted">{label}</p>
      {series.map((s, i) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value;
        return (
          <p key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-3 rounded"
              style={{ background: colors[i] }}
            />
            <span className="text-xs text-muted">{s.name}</span>
            <span className="ms-auto ps-3 font-semibold">
              {typeof v === 'number' ? format(v) : '—'}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Two (or a few) series of the same measure over the same categories: one shared y-axis,
 * a legend above the plot, 2px lines (the second dashed), nulls as gaps.
 */
export function MultiLineChart({
  data,
  series,
  categoryName,
  format,
  height = 240,
  dimmed,
}: {
  data: MultiDatum[];
  series: MultiSeries[];
  categoryName: string;
  format: (v: number) => string;
  height?: number;
  dimmed?: boolean;
}) {
  const { t } = useTranslation();
  const c = useChartColors();
  const rtl = useRtl();
  const colors = [c.series, c.series2];
  const rows = data.filter((d) => series.some((s) => d.values[s.key] !== null));
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-muted">{t('analytics.noData')}</p>;
  const flat = data.map((d) => ({ label: d.label, ...d.values }));
  return (
    <div className={cn('transition-opacity', dimmed && 'opacity-60')}>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <svg width="18" height="6" className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke={colors[i]}
                strokeWidth={2}
                strokeDasharray={i === 1 ? '4 3' : undefined}
              />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={flat}
            margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} stroke={c.grid} strokeWidth={1} />
            <XAxis
              dataKey="label"
              reversed={rtl}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              tick={axisTick(c.axis)}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              orientation={rtl ? 'right' : 'left'}
              tickLine={false}
              axisLine={false}
              tick={axisTick(c.axis)}
              width={44}
              tickFormatter={(v: number) => format(v)}
            />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={<MultiTooltip format={format} series={series} colors={colors} rtl={rtl} />}
            />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={colors[i]}
                strokeWidth={2}
                strokeDasharray={i === 1 ? '6 4' : undefined}
                connectNulls={false}
                dot={false}
                activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2, fill: colors[i] }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer select-none text-xs font-medium text-primary">
          {t('analytics.dataTable')}
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-2 py-1 text-start text-xs font-semibold text-muted">
                  {categoryName}
                </th>
                {series.map((s) => (
                  <th
                    key={s.key}
                    scope="col"
                    className="px-2 py-1 text-end text-xs font-semibold text-muted"
                  >
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.label} className="border-b border-border last:border-0">
                  <th scope="row" className="px-2 py-1 text-start font-normal">
                    {d.label}
                  </th>
                  {series.map((s) => {
                    const v = d.values[s.key];
                    return (
                      <td key={s.key} className="rv-num px-2 py-1 text-end">
                        {v === null || v === undefined ? '—' : format(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Wraps a chart with a text summary and a collapsible data table (never tooltip-only). */
function ChartFrame({
  data,
  seriesName,
  categoryName,
  format,
  dimmed,
  children,
}: Omit<SingleSeriesChartProps, 'height'> & { children: ReactNode }) {
  const { t } = useTranslation();
  const rows = data.filter((d) => d.value !== null);
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-muted">{t('analytics.noData')}</p>;
  return (
    <div className={cn('transition-opacity', dimmed && 'opacity-60')}>
      {/* recharts lays out in LTR; RTL is handled by reversing the category axis. */}
      <div dir="ltr">{children}</div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer select-none text-xs font-medium text-primary">
          {t('analytics.dataTable')}
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-2 py-1 text-start text-xs font-semibold text-muted">
                  {categoryName}
                </th>
                <th scope="col" className="px-2 py-1 text-end text-xs font-semibold text-muted">
                  {seriesName}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.label} className="border-b border-border last:border-0">
                  <th scope="row" className="px-2 py-1 text-start font-normal">
                    {d.label}
                  </th>
                  <td className="rv-num px-2 py-1 text-end">{format(d.value as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
