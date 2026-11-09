// Deterministic synthetic history for metrics endpoints: a lunch and a dinner peak in the
// site's local time, weekends busier, stable for a given site and hour.
import type {
  Bucket,
  MetricsSummary,
  RoiBlock,
  ShiftReport,
  SiteSettings,
  Table,
  TableStats,
  Timeseries,
  TimeseriesMetric,
  TimeseriesPoint,
} from '../contracts';
import { dayRange, zonedHour, zonedParts } from '../time/zoned';
import { noise } from './random';

const BUCKET_S: Record<Bucket, number> = { '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };

/** Share of capacity in use by local hour (0 = closed). */
const PROFILE = [
  0.1, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.15, 0.25, 0.45, 0.78, 0.82, 0.55, 0.3, 0.28, 0.35, 0.6, 0.9,
  0.95, 0.8, 0.55, 0.3,
];

export interface SiteModel {
  settings: SiteSettings;
  tables: Table[];
  /** Epoch seconds when the edge was installed (baseline period starts here). */
  installedAt: number;
}

interface HourStats {
  occupancy: number;
  queue: number;
  walkaways: number;
  responseP50: number | null;
  /** Mean seconds parties waited in the queue before being seated; null when nobody queued. */
  queueWait: number | null;
  sessions: number;
  guests: number;
}

function capacity(m: SiteModel): number {
  return m.tables.reduce((s, t) => s + t.seats, 0) * 0.85;
}

/** Synthetic stats for the hour starting at `hourTs` (UTC-aligned hour). */
function hourStats(m: SiteModel, hourTs: number): HourStats {
  const tz = m.settings.timezone;
  const hour = zonedHour(hourTs, tz);
  const p = zonedParts(hourTs * 1000, tz);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  // Israel: Thursday evening, Friday noon and Saturday are the busy days.
  const dayBoost = weekday === 4 || weekday === 5 || weekday === 6 ? 1.12 : 1;
  const base = (PROFILE[hour] ?? 0) * dayBoost;
  const n = (k: string) => noise(m.settings.site_id, hourTs, k);
  const occ = Math.max(0, Math.min(1, base * (0.85 + n('o') * 0.3))) * capacity(m);
  const pressure = Math.max(0, base - 0.72);
  const queue = pressure > 0 ? pressure * 30 * (0.6 + n('q') * 0.8) : 0;
  const walkaways = pressure > 0 ? Math.round(pressure * 10 * n('w') * 1.6) : 0;
  const responseP50 = base > 0.05 ? Math.round(55 + base * 110 + n('r') * 40) : null;
  const queueWait = queue > 0.5 ? Math.round(120 + queue * 35 + n('qw') * 90) : null;
  const avgParty = 2.6;
  const dwellH = 0.95;
  const sessions = occ / avgParty / dwellH;
  return {
    occupancy: occ,
    queue,
    walkaways,
    responseP50,
    queueWait,
    sessions,
    guests: sessions * avgParty,
  };
}

function hoursIn(from: number, to: number, now: number): number[] {
  const out: number[] = [];
  const end = Math.min(to, now);
  for (let t = Math.floor(from / 3600) * 3600; t < end; t += 3600) {
    if (t + 3600 > from) out.push(t);
  }
  return out;
}

function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx]!;
}

/** Response-time baseline (first 7 days after install), slower than today. */
function baselineP50(m: SiteModel): number {
  return Math.round(180 + noise(m.settings.site_id, 'baseline') * 40);
}

export function summary(m: SiteModel, from: number, to: number, now: number): MetricsSummary {
  const hours = hoursIn(from, to, now).map((h) => hourStats(m, h));
  const sessionsF = hours.reduce((s, h) => s + h.sessions, 0);
  const sessions = Math.round(sessionsF);
  const guests = Math.round(hours.reduce((s, h) => s + h.guests, 0));
  const walkaways = hours.reduce((s, h) => s + h.walkaways, 0);
  const responses = hours
    .filter((h) => h.responseP50 !== null)
    .flatMap((h) => [h.responseP50! * 0.7, h.responseP50!, h.responseP50! * 1.9])
    .sort((a, b) => a - b);
  const queued = hours.filter((h) => h.queue > 0.5);
  const avgParty = 2.4;
  const has = sessions > 0;
  const n = noise(m.settings.site_id, from, to);
  return {
    site_id: m.settings.site_id,
    from_ts: from,
    to_ts: to,
    currency: m.settings.currency,
    sessions,
    guests_served: guests,
    avg_dwell_s: has ? Math.round(3100 + n * 900) : null,
    turnover_per_table: has
      ? Math.round((sessions / Math.max(1, m.tables.length)) * 10) / 10
      : null,
    waiter_response_p50_s: percentile(responses, 0.5),
    waiter_response_p90_s: percentile(responses, 0.9),
    bussing_delay_p50_s: has ? Math.round(120 + n * 90) : null,
    queue_avg_wait_s: queued.length ? Math.round(240 + n * 160) : null,
    queue_max_wait_s: queued.length ? Math.round(780 + n * 600) : null,
    walkaways,
    lost_revenue: {
      value: has ? Math.round(walkaways * avgParty * m.settings.avg_check_per_guest) : null,
      is_estimate: true,
    },
  };
}

export function timeseries(
  m: SiteModel,
  metric: TimeseriesMetric,
  bucket: Bucket,
  from: number,
  to: number,
  now: number,
): Timeseries {
  const step = BUCKET_S[bucket];
  const points: TimeseriesPoint[] = [];
  const start = bucket === '1d' ? from : Math.floor(from / step) * step;
  for (let t = start; t < to; t += step) {
    if (t >= now) {
      points.push({ ts: t, value: null });
      continue;
    }
    const hours = hoursIn(t, t + step, now).map((h) => hourStats(m, h));
    const fraction = Math.min(1, step / 3600);
    let value: number | null;
    switch (metric) {
      case 'occupancy':
        value = hours.length ? hours.reduce((s, h) => s + h.occupancy, 0) / hours.length : null;
        if (value !== null) value = Math.round(value * (0.95 + noise(t, 'occ') * 0.1));
        break;
      case 'queue':
        value = hours.length
          ? Math.round((hours.reduce((s, h) => s + h.queue, 0) / hours.length) * 10) / 10
          : null;
        break;
      case 'walkaways':
        value = Math.round(hours.reduce((s, h) => s + h.walkaways, 0) * fraction);
        break;
      case 'response_time':
      case 'response_time_p90': {
        // p90 follows the p50 with the long tail of a busy floor (same 1.9x as `summary`).
        const tail = metric === 'response_time_p90' ? 1.9 : 1;
        const r = hours.map((h) => h.responseP50).filter((v): v is number => v !== null);
        value = r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * tail) : null;
        break;
      }
      case 'queue_wait': {
        // Mean seconds per bucket; null (a gap) when nobody was seated from the queue.
        const w = hours.map((h) => h.queueWait).filter((v): v is number => v !== null);
        value = w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null;
        break;
      }
      default: {
        const unknown: never = metric;
        throw new Error(`unknown metric ${String(unknown)}`);
      }
    }
    points.push({ ts: t, value });
  }
  return { site_id: m.settings.site_id, metric, bucket, from_ts: from, to_ts: to, points };
}

export function tableStats(m: SiteModel, from: number, to: number, now: number): TableStats[] {
  const s = summary(m, from, to, now);
  const totalSeats = m.tables.reduce((acc, t) => acc + t.seats, 0);
  return m.tables.map((t) => {
    const n = noise(m.settings.site_id, t.table_id, from);
    const share = (t.seats / totalSeats) * (0.8 + n * 0.4);
    const sessions = Math.round((s.sessions * share * t.seats) / Math.max(1, t.seats));
    const party = Math.min(t.seats, Math.max(1, Math.round(t.seats * (0.55 + n * 0.35) * 10) / 10));
    return {
      table_id: t.table_id,
      label: t.label,
      seats: t.seats,
      sessions,
      guests: Math.round(sessions * party),
      avg_dwell_s: sessions ? Math.round(2400 + t.seats * 200 + n * 900) : null,
      avg_party_size: sessions ? party : null,
      first_visit_delay_p50_s: sessions ? Math.round(60 + n * 140) : null,
      bussing_delay_p50_s: sessions ? Math.round(90 + noise(t.table_id, 'b') * 160) : null,
    };
  });
}

export function shiftReport(m: SiteModel, date: string, now: number): ShiftReport {
  const tz = m.settings.timezone;
  const { from, to } = dayRange(date, tz);
  const s = summary(m, from, to, now);
  const occ = timeseries(m, 'occupancy', '1h', from, to, now);
  const hours = hoursIn(from, to, now).map((h) => hourStats(m, h));
  const queuedHours = hours.filter((h) => h.queue > 0.5);
  const has = s.sessions > 0;
  const baseline = baselineP50(m);
  const current = s.waiter_response_p50_s;
  const extraCovers = has
    ? Math.round(queuedHours.reduce((acc, h) => acc + Math.min(h.queue, 6) * 0.35, 0))
    : null;
  const roi: RoiBlock = {
    is_estimate: true,
    currency: m.settings.currency,
    avg_check_per_guest: m.settings.avg_check_per_guest,
    walkaways: s.walkaways,
    lost_revenue: s.lost_revenue,
    response_time_baseline_p50_s: baseline,
    response_time_current_p50_s: current,
    response_time_improvement_s: {
      value: current !== null ? Math.round(baseline - current) : null,
      is_estimate: true,
    },
    extra_covers: { value: extraCovers, is_estimate: true },
    extra_revenue: {
      value: extraCovers !== null ? Math.round(extraCovers * m.settings.avg_check_per_guest) : null,
      is_estimate: true,
    },
  };
  return {
    site_id: m.settings.site_id,
    date,
    timezone: tz,
    from_ts: from,
    to_ts: to,
    summary: s,
    tables: tableStats(m, from, to, now),
    occupancy_by_hour: occ.points,
    roi,
  };
}
