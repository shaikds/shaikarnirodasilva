import { zonedHour, type Timeseries } from '@rv/shared';
import type { ChartDatum } from '../components/charts';

const pad = (n: number) => String(n).padStart(2, '0');

/** Mean value per local hour of day, hours with activity only. */
export function byHourOfDay(series: Timeseries | undefined, timeZone: string): ChartDatum[] {
  if (!series) return [];
  const sums = new Map<number, { sum: number; n: number }>();
  for (const p of series.points) {
    if (p.value === null) continue;
    const h = zonedHour(p.ts, timeZone);
    const cur = sums.get(h) ?? { sum: 0, n: 0 };
    cur.sum += p.value;
    cur.n += 1;
    sums.set(h, cur);
  }
  const hours = [...sums.entries()].filter(([, v]) => v.sum > 0).map(([h]) => h);
  if (!hours.length) return [];
  const out: ChartDatum[] = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
    const v = sums.get(h);
    out.push({ label: `${pad(h)}:00`, value: v ? Math.round((v.sum / v.n) * 10) / 10 : 0 });
  }
  return out;
}
