// Site-timezone helpers without a date library. Reports use the site's local calendar day.

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(epochMs: number, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(new Date(epochMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Offset of `timeZone` from UTC at an instant, in ms (Asia/Jerusalem in summer: +3h). */
export function tzOffsetMs(epochMs: number, timeZone: string): number {
  const p = zonedParts(epochMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`invalid date ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Epoch seconds of local midnight of `date` (YYYY-MM-DD) in `timeZone`. */
export function zonedDayStart(date: string, timeZone: string): number {
  const [y, mo, d] = parseDate(date);
  const guess = Date.UTC(y, mo - 1, d);
  const off1 = tzOffsetMs(guess, timeZone);
  let t = guess - off1;
  const off2 = tzOffsetMs(t, timeZone);
  if (off2 !== off1) t = guess - off2;
  return t / 1000;
}

/** `YYYY-MM-DD` of an instant in `timeZone`. */
export function zonedDate(epochSeconds: number, timeZone: string): string {
  const p = zonedParts(epochSeconds * 1000, timeZone);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local hour (0-23) of an instant in `timeZone`. */
export function zonedHour(epochSeconds: number, timeZone: string): number {
  return zonedParts(epochSeconds * 1000, timeZone).hour;
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = parseDate(date);
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function todayIn(timeZone: string, nowSeconds = Date.now() / 1000): string {
  return zonedDate(nowSeconds, timeZone);
}

/** `[from, to)` covering one local day. */
export function dayRange(date: string, timeZone: string): { from: number; to: number } {
  return { from: zonedDayStart(date, timeZone), to: zonedDayStart(addDays(date, 1), timeZone) };
}

/** `[from, to)` covering the last `days` local days including today (to = end of today). */
export function lastDaysRange(
  days: number,
  timeZone: string,
  nowSeconds = Date.now() / 1000,
): { from: number; to: number } {
  const today = todayIn(timeZone, nowSeconds);
  return {
    from: zonedDayStart(addDays(today, -(days - 1)), timeZone),
    to: zonedDayStart(addDays(today, 1), timeZone),
  };
}
