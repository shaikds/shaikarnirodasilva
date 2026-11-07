// Automatic table suggestions (`POST /local/cameras/{id}/suggest-tables`) turned into real
// tables and table zones. Pure: accepting returns a new SiteConfig.
import type { SiteConfig, Table, Zone } from '@rv/shared';
import { clampPoint, isValidPolygon, type Pt } from './geometry';
import { SEATS_MAX, SEATS_MIN } from './validation';
import { nextId } from './zones';

export interface SuggestionLike {
  suggestion_id: string;
  polygon: readonly (readonly number[])[];
  table_box: readonly number[];
  seats_est: number;
  confidence: number;
}

/**
 * `count` table labels "1", "2", ... that no existing table uses: the lowest free numbers, so
 * gaps are filled first and nothing collides with labels that are already there ("3", "Bar").
 */
export function nextTableLabels(existing: readonly string[], count: number): string[] {
  const taken = new Set(existing.map((l) => l.trim()));
  const labels: string[] = [];
  for (let n = 1; labels.length < count; n++) {
    const label = String(n);
    if (!taken.has(label)) {
      labels.push(label);
      taken.add(label);
    }
  }
  return labels;
}

export function seatsFromEstimate(seatsEst: number): number {
  const n = Math.round(Number.isFinite(seatsEst) ? seatsEst : SEATS_MIN);
  return Math.min(SEATS_MAX, Math.max(SEATS_MIN, n));
}

/** The suggestion's outline as a valid polygon (clamped), falling back to its box. */
export function suggestionPolygon(s: SuggestionLike): Pt[] | null {
  const poly = s.polygon.filter((p) => p.length === 2).map((p) => clampPoint([p[0]!, p[1]!]));
  if (isValidPolygon(poly)) return poly;
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = s.table_box;
  const box = [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ].map((p) => clampPoint(p as Pt));
  return isValidPolygon(box) ? box : null;
}

export interface Accepted {
  suggestionId: string;
  tableId: string;
  zoneId: string;
}

/**
 * Accepts `suggestions` on `cameraId`: each becomes a Table (next free number as label, seats
 * from `seats_est`) plus a primary table Zone with the suggested outline. Suggestions without a
 * usable outline are skipped.
 */
export function acceptSuggestions(
  config: SiteConfig,
  cameraId: string,
  suggestions: readonly SuggestionLike[],
): { config: SiteConfig; accepted: Accepted[] } {
  const usable = suggestions
    .map((s) => ({ s, polygon: suggestionPolygon(s) }))
    .filter((x): x is { s: SuggestionLike; polygon: Pt[] } => x.polygon !== null);
  const labels = nextTableLabels(
    config.tables.map((t) => t.label),
    usable.length,
  );
  const tableIds = config.tables.map((t) => t.table_id);
  const zoneIds = config.zones.map((z) => z.zone_id);
  const tables: Table[] = [];
  const zones: Zone[] = [];
  const accepted: Accepted[] = [];
  usable.forEach(({ s, polygon }, i) => {
    const tableId = nextId('t', [...tableIds, ...tables.map((t) => t.table_id)]);
    const zoneId = nextId('zone-table', [...zoneIds, ...zones.map((z) => z.zone_id)]);
    tables.push({ table_id: tableId, label: labels[i]!, seats: seatsFromEstimate(s.seats_est), section: null });
    // A brand-new table has no primary zone yet, so this camera counts it.
    const hasPrimary = config.zones.some((z) => z.table_id === tableId && z.primary);
    zones.push({
      zone_id: zoneId,
      camera_id: cameraId,
      kind: 'table',
      polygon,
      line: null,
      table_id: tableId,
      primary: !hasPrimary,
    });
    accepted.push({ suggestionId: s.suggestion_id, tableId, zoneId });
  });
  return {
    config: { ...config, tables: [...config.tables, ...tables], zones: [...config.zones, ...zones] },
    accepted,
  };
}

/** Confidence as a whole percentage, e.g. 0.714 -> 71. */
export const confidencePct = (c: number): number => Math.round(Math.min(1, Math.max(0, c)) * 100);
