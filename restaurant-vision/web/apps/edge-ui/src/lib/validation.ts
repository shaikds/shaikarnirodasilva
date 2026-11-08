// Client-side mirror of the SiteConfig rules in rv_contracts (config.py, geometry.py, _base.py),
// so the installer sees problems before `PUT /local/config` and the edge's own validation
// (the source of truth) rarely has to reject anything. Issues carry a code + params for i18n
// and the id of the thing to fix, so the UI can link to it.
import type { SiteConfig, Zone } from '@rv/shared';
import { EPS, isInUnitSquare, polygonArea, type Pt } from './geometry';

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
export const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+)$/;
export const LABEL_MAX = 64;
export const SEATS_MIN = 1;
export const SEATS_MAX = 50;
export const FPS_MAX = 30;

export type IssueSeverity = 'error' | 'warning';

export type IssueCode =
  | 'siteIdInvalid'
  | 'timezoneInvalid'
  | 'idInvalid'
  | 'duplicateId'
  | 'labelRequired'
  | 'labelTooLong'
  | 'seatsRange'
  | 'fpsRange'
  | 'maskInvalid'
  | 'unknownCamera'
  | 'unknownTable'
  | 'tableRequired'
  | 'tableIdNotAllowed'
  | 'primaryNotAllowed'
  | 'polygonRequired'
  | 'polygonNotAllowed'
  | 'lineRequired'
  | 'lineNotAllowed'
  | 'polygonTooFewPoints'
  | 'polygonZeroArea'
  | 'pointOutOfRange'
  | 'lineNeedsTwoPoints'
  | 'lineZeroLength'
  | 'multiplePrimary'
  | 'tableUncovered'
  | 'cameraWithoutZones';

export type IssueEntity = 'site' | 'camera' | 'table' | 'zone';

export interface Issue {
  severity: IssueSeverity;
  code: IssueCode;
  entity: IssueEntity;
  /** Id of the camera/table/zone to fix (site issues: the site id). */
  id: string;
  /** Extra values for the message. */
  params?: Record<string, string | number>;
}

/** Length in code points (Python `len`), so Hebrew and emoji count like the edge counts them. */
export const textLength = (s: string): number => [...s].length;

function checkLabel(
  issues: Issue[],
  value: string | null | undefined,
  entity: IssueEntity,
  id: string,
  field: string,
  optional = false,
) {
  if (value === null || value === undefined) {
    if (!optional) issues.push({ severity: 'error', code: 'labelRequired', entity, id, params: { field } });
    return;
  }
  const len = textLength(value);
  if (len < 1) issues.push({ severity: 'error', code: 'labelRequired', entity, id, params: { field } });
  else if (len > LABEL_MAX)
    issues.push({ severity: 'error', code: 'labelTooLong', entity, id, params: { field, max: LABEL_MAX } });
}

function checkIds(issues: Issue[], entity: IssueEntity, ids: string[]) {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const id of ids) {
    if (!ID_PATTERN.test(id)) issues.push({ severity: 'error', code: 'idInvalid', entity, id });
    if (seen.has(id) && !reported.has(id)) {
      issues.push({ severity: 'error', code: 'duplicateId', entity, id });
      reported.add(id);
    }
    seen.add(id);
  }
}

/** Polygon rules (geometry.Polygon): >= 3 points, coordinates in [0, 1], non-zero area. */
export function polygonIssues(polygon: readonly (readonly number[])[]): IssueCode[] {
  const codes: IssueCode[] = [];
  if (polygon.some((p) => !isInUnitSquare(p))) codes.push('pointOutOfRange');
  if (polygon.length < 3) codes.push('polygonTooFewPoints');
  else if (polygonArea(polygon as Pt[]) <= EPS) codes.push('polygonZeroArea');
  return codes;
}

/** Shape rules of one zone (config.Zone._check_kind + geometry.Line). */
export function zoneShapeIssues(zone: Zone): IssueCode[] {
  const codes: IssueCode[] = [];
  if (zone.kind === 'entrance_line') {
    if (zone.polygon) codes.push('polygonNotAllowed');
    if (!zone.line) codes.push('lineRequired');
    else {
      const { a, b } = zone.line;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2)
        codes.push('lineNeedsTwoPoints');
      else {
        if (!isInUnitSquare(a) || !isInUnitSquare(b)) codes.push('pointOutOfRange');
        if (Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS) codes.push('lineZeroLength');
      }
    }
  } else {
    if (zone.line) codes.push('lineNotAllowed');
    if (!zone.polygon) codes.push('polygonRequired');
    else codes.push(...polygonIssues(zone.polygon));
  }
  return codes;
}

/**
 * Every problem in `config`. Errors block saving (the edge would reject the config); warnings
 * (coverage gaps, cameras without zones) are allowed, like the edge allows them.
 */
export function validateConfig(config: SiteConfig): Issue[] {
  const issues: Issue[] = [];
  if (!ID_PATTERN.test(config.site_id))
    issues.push({ severity: 'error', code: 'siteIdInvalid', entity: 'site', id: config.site_id });
  if (config.timezone.length > 64 || !TIMEZONE_PATTERN.test(config.timezone))
    issues.push({ severity: 'error', code: 'timezoneInvalid', entity: 'site', id: config.site_id });

  // cameras
  checkIds(issues, 'camera', config.cameras.map((c) => c.camera_id));
  for (const c of config.cameras) {
    checkLabel(issues, c.name, 'camera', c.camera_id, 'name');
    if (!(c.target_fps > 0 && c.target_fps <= FPS_MAX))
      issues.push({ severity: 'error', code: 'fpsRange', entity: 'camera', id: c.camera_id });
    if (c.privacy_masks.some((m) => polygonIssues(m).length > 0))
      issues.push({ severity: 'error', code: 'maskInvalid', entity: 'camera', id: c.camera_id });
  }

  // tables
  checkIds(issues, 'table', config.tables.map((t) => t.table_id));
  for (const t of config.tables) {
    checkLabel(issues, t.label, 'table', t.table_id, 'label');
    checkLabel(issues, t.section, 'table', t.table_id, 'section', true);
    if (!Number.isInteger(t.seats) || t.seats < SEATS_MIN || t.seats > SEATS_MAX)
      issues.push({
        severity: 'error',
        code: 'seatsRange',
        entity: 'table',
        id: t.table_id,
        params: { min: SEATS_MIN, max: SEATS_MAX },
      });
  }

  // zones
  checkIds(issues, 'zone', config.zones.map((z) => z.zone_id));
  const cameraIds = new Set(config.cameras.map((c) => c.camera_id));
  const tableIds = new Set(config.tables.map((t) => t.table_id));
  const primaries = new Map<string, string[]>();
  for (const z of config.zones) {
    const add = (code: IssueCode, params?: Issue['params']) =>
      issues.push({ severity: 'error', code, entity: 'zone', id: z.zone_id, params });
    for (const code of zoneShapeIssues(z)) add(code);
    if (!cameraIds.has(z.camera_id)) add('unknownCamera', { camera: z.camera_id });
    if (z.kind === 'table') {
      if (z.table_id === null) add('tableRequired');
    } else {
      if (z.table_id !== null) add('tableIdNotAllowed');
      if (z.primary) add('primaryNotAllowed');
    }
    if (z.table_id !== null) {
      if (!tableIds.has(z.table_id)) add('unknownTable', { table: z.table_id });
      if (z.primary) primaries.set(z.table_id, [...(primaries.get(z.table_id) ?? []), z.zone_id]);
    }
  }
  for (const [tableId, zoneIds] of primaries) {
    if (zoneIds.length > 1)
      issues.push({
        severity: 'error',
        code: 'multiplePrimary',
        entity: 'table',
        id: tableId,
        params: { n: zoneIds.length, zones: zoneIds.join(', ') },
      });
  }

  // warnings
  for (const tableId of uncoveredTables(config))
    issues.push({ severity: 'warning', code: 'tableUncovered', entity: 'table', id: tableId });
  for (const c of config.cameras) {
    if (c.enabled && !config.zones.some((z) => z.camera_id === c.camera_id))
      issues.push({ severity: 'warning', code: 'cameraWithoutZones', entity: 'camera', id: c.camera_id });
  }
  return issues;
}

export const errorsOf = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'error');

/** SiteConfig.coverage(): tables without a primary zone on an enabled camera, in table order. */
export function uncoveredTables(config: SiteConfig): string[] {
  const enabled = new Set(config.cameras.filter((c) => c.enabled).map((c) => c.camera_id));
  const covered = new Set(
    config.zones
      .filter((z) => z.kind === 'table' && z.primary && enabled.has(z.camera_id))
      .map((z) => z.table_id),
  );
  return config.tables.filter((t) => !covered.has(t.table_id)).map((t) => t.table_id);
}
