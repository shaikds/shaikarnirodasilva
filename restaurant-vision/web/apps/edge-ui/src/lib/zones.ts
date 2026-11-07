// Zone kinds as the editor presents them: draw order, colors (fixed, chosen to stay visible on
// any camera picture, always paired with a text label) and helpers to create zones.
import type { Line, SiteConfig, Zone, ZoneKind } from '@rv/shared';
import type { Pt } from './geometry';

export const ZONE_KINDS = [
  'table',
  'queue',
  'entrance_line',
  'staff_area',
  'area',
  'privacy',
] as const satisfies readonly ZoneKind[];

export interface ZoneStyle {
  /** Stroke and handle color. */
  color: string;
  /** Fill opacity of polygons. */
  fillOpacity: number;
  /** Paint order: lower first. */
  layer: number;
  /** Dashed outline (privacy masks). */
  dash?: string;
}

export const ZONE_STYLE: Record<ZoneKind, ZoneStyle> = {
  privacy: { color: '#111827', fillOpacity: 0.72, layer: 0, dash: '6 4' },
  area: { color: '#0891b2', fillOpacity: 0.18, layer: 1 },
  staff_area: { color: '#059669', fillOpacity: 0.2, layer: 2 },
  queue: { color: '#7c3aed', fillOpacity: 0.2, layer: 3 },
  table: { color: '#d97706', fillOpacity: 0.22, layer: 4 },
  entrance_line: { color: '#2563eb', fillOpacity: 0, layer: 5 },
};

export const isLineKind = (kind: ZoneKind): boolean => kind === 'entrance_line';

/** Points the editor manipulates for a zone: polygon vertices, or the line's a and b. */
export function zonePoints(zone: Zone): Pt[] {
  if (zone.kind === 'entrance_line') return zone.line ? [zone.line.a, zone.line.b] : [];
  return (zone.polygon ?? []) as Pt[];
}

/** The zone with its points replaced (polygon, or line endpoints). */
export function withPoints(zone: Zone, points: Pt[]): Zone {
  if (zone.kind === 'entrance_line') {
    const [a, b] = points;
    if (!a || !b) return zone;
    const line: Line = { a, b, in_direction: zone.line?.in_direction ?? 'left_to_right' };
    return { ...zone, line, polygon: null };
  }
  return { ...zone, polygon: points, line: null };
}

/** Zones sorted in paint order (privacy at the bottom, lines on top). Stable. */
export function paintOrder(zones: readonly Zone[]): Zone[] {
  return zones
    .map((z, i) => ({ z, i }))
    .sort((a, b) => ZONE_STYLE[a.z.kind].layer - ZONE_STYLE[b.z.kind].layer || a.i - b.i)
    .map(({ z }) => z);
}

const ID_SAFE = /[^A-Za-z0-9_.:-]+/g;

/** A new id `<prefix>-<n>` not in `taken` (valid rv_contracts Id). */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = prefix.replace(ID_SAFE, '-').replace(/^[^A-Za-z0-9]+/, '') || 'id';
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`.slice(0, 64);
    if (!used.has(id)) return id;
  }
}

const ZONE_PREFIX: Record<ZoneKind, string> = {
  table: 'zone-table',
  queue: 'zone-queue',
  entrance_line: 'zone-entrance',
  staff_area: 'zone-staff',
  area: 'zone-area',
  privacy: 'zone-privacy',
};

/**
 * A new zone of `kind` on `cameraId` from the drawn points. Table zones get the first table
 * that nobody counts yet (else the first table) and become primary when that table has no
 * primary zone.
 */
export function createZone(config: SiteConfig, cameraId: string, kind: ZoneKind, points: Pt[]): Zone {
  const zoneId = nextId(ZONE_PREFIX[kind], config.zones.map((z) => z.zone_id));
  const base: Zone = {
    zone_id: zoneId,
    camera_id: cameraId,
    kind,
    polygon: null,
    line: null,
    table_id: null,
    primary: false,
  };
  if (kind === 'entrance_line') {
    const [a, b] = points as [Pt, Pt];
    return { ...base, line: { a, b, in_direction: 'left_to_right' } };
  }
  if (kind === 'table') {
    const withPrimary = new Set(config.zones.filter((z) => z.primary).map((z) => z.table_id));
    const withAnyZone = new Set(config.zones.map((z) => z.table_id));
    const table =
      config.tables.find((t) => !withAnyZone.has(t.table_id)) ??
      config.tables.find((t) => !withPrimary.has(t.table_id)) ??
      config.tables[0];
    return {
      ...base,
      polygon: points,
      table_id: table?.table_id ?? null,
      primary: table ? !withPrimary.has(table.table_id) : false,
    };
  }
  return { ...base, polygon: points };
}

/**
 * Sets `zone.primary` and clears it on the table's other zones (at most one primary per table).
 */
export function setPrimary(zones: readonly Zone[], zoneId: string, primary: boolean): Zone[] {
  const target = zones.find((z) => z.zone_id === zoneId);
  if (!target) return [...zones];
  return zones.map((z) => {
    if (z.zone_id === zoneId) return { ...z, primary };
    if (primary && target.table_id && z.table_id === target.table_id && z.primary)
      return { ...z, primary: false };
    return z;
  });
}
