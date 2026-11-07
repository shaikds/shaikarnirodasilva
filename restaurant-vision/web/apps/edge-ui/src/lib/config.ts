// SiteConfig helpers for the wizard: a starting config when the edge has none, the camera list
// merged from the config and the edge's stored streams, and edits that keep references valid.
import {
  CONTRACT_SCHEMA_VERSION,
  DEFAULT_THRESHOLDS,
  type CameraConfig,
  type Locale,
  type SiteConfig,
  type Table,
} from '@rv/shared';
import type { CameraOut } from '../api/types';
import { ID_PATTERN, TIMEZONE_PATTERN } from './validation';
import { nextId } from './zones';

export const LOCAL_SITE_ID = 'local-site';

export function browserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_PATTERN.test(tz)) return tz;
  } catch {
    // ignore
  }
  return 'UTC';
}

/** A fresh config for an edge that has none yet (`GET /local/config` -> 404). */
export function emptyConfig(siteId: string | null | undefined, locale: Locale): SiteConfig {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    site_id: siteId && ID_PATTERN.test(siteId) ? siteId : LOCAL_SITE_ID,
    timezone: browserTimezone(),
    locale,
    cameras: [],
    tables: [],
    zones: [],
    thresholds: { ...DEFAULT_THRESHOLDS },
    modules: { occupancy: true, queue: true, tables: true, alerts: true },
    config_version: 0,
  };
}

/**
 * The config to send: a paired edge only accepts its own site id (runtime._check_site), so the
 * draft follows the pairing. Everything the wizard does not edit (thresholds, modules, timezone,
 * locale, config_version) is passed through unchanged.
 */
export function forSite(config: SiteConfig, pairedSiteId: string | null | undefined): SiteConfig {
  if (pairedSiteId && ID_PATTERN.test(pairedSiteId) && config.site_id !== pairedSiteId)
    return { ...config, site_id: pairedSiteId };
  return config;
}

export function newCameraConfig(cameraId: string, name: string): CameraConfig {
  return {
    camera_id: cameraId,
    name,
    source: 'rtsp',
    anchor: 'foot',
    target_fps: 5,
    privacy_masks: [],
    enabled: true,
  };
}

/** One row of the camera list: config entry and/or stored stream. */
export interface CameraRow {
  camera_id: string;
  name: string;
  /** From the config, else the stored stream's kind. */
  source: string;
  enabled: boolean;
  config: CameraConfig | null;
  stream: CameraOut | null;
}

/** Config cameras first (config order), then streams the config does not list yet. */
export function cameraRows(config: SiteConfig, streams: readonly CameraOut[]): CameraRow[] {
  const byId = new Map(streams.map((s) => [s.camera_id, s]));
  const rows: CameraRow[] = config.cameras.map((c) => ({
    camera_id: c.camera_id,
    name: c.name,
    source: c.source,
    enabled: c.enabled,
    config: c,
    stream: byId.get(c.camera_id) ?? null,
  }));
  const listed = new Set(rows.map((r) => r.camera_id));
  for (const s of streams) {
    if (listed.has(s.camera_id)) continue;
    rows.push({
      camera_id: s.camera_id,
      name: s.name ?? s.camera_id,
      source: s.kind,
      enabled: s.enabled ?? true,
      config: null,
      stream: s,
    });
  }
  return rows;
}

/** A camera id derived from the name when it is ASCII, else `cam-<n>`. */
export function cameraIdFor(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (slug && ID_PATTERN.test(slug) && !used.has(slug)) return slug;
  return nextId(slug || 'cam', used);
}

/** Removes a camera and every zone drawn on it. */
export function removeCamera(config: SiteConfig, cameraId: string): SiteConfig {
  return {
    ...config,
    cameras: config.cameras.filter((c) => c.camera_id !== cameraId),
    zones: config.zones.filter((z) => z.camera_id !== cameraId),
  };
}

/** Removes a table and its table zones. */
export function removeTable(config: SiteConfig, tableId: string): SiteConfig {
  return {
    ...config,
    tables: config.tables.filter((t) => t.table_id !== tableId),
    zones: config.zones.filter((z) => z.table_id !== tableId),
  };
}

/** `count` new tables labelled after the highest numeric label so far. */
export function quickAddTables(config: SiteConfig, count: number, seats: number): Table[] {
  const numbers = config.tables.map((t) => Number(t.label)).filter((n) => Number.isInteger(n));
  let label = numbers.length ? Math.max(...numbers) : 0;
  const ids = config.tables.map((t) => t.table_id);
  const added: Table[] = [];
  for (let i = 0; i < count; i++) {
    label += 1;
    const id = nextId('t', [...ids, ...added.map((t) => t.table_id)]);
    added.push({ table_id: id, label: String(label), seats, section: null });
  }
  return added;
}

/** Stable JSON for "has the draft changed since the last save". */
export function sameConfig(a: SiteConfig | null | undefined, b: SiteConfig | null | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
