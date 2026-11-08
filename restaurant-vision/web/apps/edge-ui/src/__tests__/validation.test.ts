// Client-side config validation mirrors rv_contracts (config.py / geometry.py).
import type { SiteConfig, Zone } from '@rv/shared';
import { describe, expect, it } from 'vitest';
import { errorsOf, uncoveredTables, validateConfig, type IssueCode } from '../lib/validation';
import { sampleConfig } from './fixtures';

const codes = (config: SiteConfig): IssueCode[] => errorsOf(validateConfig(config)).map((i) => i.code);

const zone = (over: Partial<Zone>): Zone => ({
  zone_id: 'z',
  camera_id: 'dining',
  kind: 'queue',
  polygon: [
    [0.5, 0.1],
    [0.7, 0.1],
    [0.7, 0.3],
  ],
  line: null,
  table_id: null,
  primary: false,
  ...over,
});

describe('validateConfig', () => {
  it('accepts a valid config (warnings are not errors)', () => {
    const issues = validateConfig(sampleConfig());
    expect(errorsOf(issues)).toEqual([]);
    // Table 2 has no primary zone: a coverage warning, allowed while setting up.
    expect(issues).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'tableUncovered', id: 't-2' }));
  });

  it('polygons need at least 3 points and a non-zero area', () => {
    const c = sampleConfig();
    expect(codes({ ...c, zones: [zone({ polygon: [[0.1, 0.1], [0.2, 0.2]] })] })).toContain('polygonTooFewPoints');
    expect(
      codes({ ...c, zones: [zone({ polygon: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]] })] }),
    ).toContain('polygonZeroArea');
  });

  it('coordinates must be within 0..1', () => {
    const c = sampleConfig();
    expect(codes({ ...c, zones: [zone({ polygon: [[0.1, 0.1], [1.2, 0.1], [0.5, 0.5]] })] })).toContain(
      'pointOutOfRange',
    );
    expect(
      codes({
        ...c,
        zones: [zone({ kind: 'entrance_line', polygon: null, line: { a: [-0.1, 0.5], b: [0.5, 0.5], in_direction: 'left_to_right' } })],
      }),
    ).toContain('pointOutOfRange');
  });

  it('ids must be unique and well formed', () => {
    const c = sampleConfig();
    expect(codes({ ...c, tables: [...c.tables, { ...c.tables[0]!, label: 'dup' }] })).toContain('duplicateId');
    expect(codes({ ...c, zones: [...c.zones, zone({ zone_id: 'zone-table-1' })] })).toContain('duplicateId');
    expect(codes({ ...c, tables: [{ table_id: 'bad id!', label: 'x', seats: 2, section: null }] })).toContain('idInvalid');
  });

  it('each table has at most one primary zone', () => {
    const c = sampleConfig();
    const second = zone({ zone_id: 'zone-table-2', kind: 'table', table_id: 't-1', primary: true });
    const issues = errorsOf(validateConfig({ ...c, zones: [...c.zones, second] }));
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'multiplePrimary', entity: 'table', id: 't-1', params: expect.objectContaining({ n: 2 }) }),
    );
  });

  it('entrance lines have exactly 2 distinct points and no polygon', () => {
    const c = sampleConfig();
    const line = { a: [0.2, 0.5] as [number, number], b: [0.2, 0.5] as [number, number], in_direction: 'left_to_right' as const };
    expect(codes({ ...c, zones: [zone({ kind: 'entrance_line', polygon: null, line })] })).toContain('lineZeroLength');
    expect(
      codes({ ...c, zones: [zone({ kind: 'entrance_line', polygon: null, line: { ...line, a: [0.5] as unknown as [number, number] } })] }),
    ).toContain('lineNeedsTwoPoints');
    expect(codes({ ...c, zones: [zone({ kind: 'entrance_line' })] })).toEqual(
      expect.arrayContaining(['lineRequired', 'polygonNotAllowed']),
    );
  });

  it('kind rules: table zones need a known table; only they can be primary', () => {
    const c = sampleConfig();
    expect(codes({ ...c, zones: [zone({ kind: 'table' })] })).toContain('tableRequired');
    expect(codes({ ...c, zones: [zone({ kind: 'table', table_id: 'ghost' })] })).toContain('unknownTable');
    expect(codes({ ...c, zones: [zone({ primary: true })] })).toContain('primaryNotAllowed');
    expect(codes({ ...c, zones: [zone({ table_id: 't-1' })] })).toContain('tableIdNotAllowed');
    expect(codes({ ...c, zones: [zone({ camera_id: 'ghost' })] })).toContain('unknownCamera');
  });

  it('labels, seats and site fields', () => {
    const c = sampleConfig();
    expect(codes({ ...c, tables: [{ table_id: 't-1', label: '', seats: 4, section: null }] })).toContain('labelRequired');
    expect(codes({ ...c, tables: [{ table_id: 't-1', label: 'x'.repeat(65), seats: 4, section: null }] })).toContain('labelTooLong');
    // 64 Hebrew letters are fine: length counts code points like Python.
    expect(codes({ ...c, tables: [{ table_id: 't-1', label: 'א'.repeat(64), seats: 4, section: null }] })).toEqual([]);
    expect(codes({ ...c, tables: [{ table_id: 't-1', label: '1', seats: 0, section: null }] })).toContain('seatsRange');
    expect(codes({ ...c, tables: [{ table_id: 't-1', label: '1', seats: 51, section: null }] })).toContain('seatsRange');
    expect(codes({ ...c, timezone: 'Jerusalem' })).toContain('timezoneInvalid');
    expect(codes({ ...c, site_id: '-x' })).toContain('siteIdInvalid');
  });

  it('coverage mirrors SiteConfig.coverage(): disabled cameras do not count', () => {
    const c = sampleConfig();
    expect(uncoveredTables(c)).toEqual(['t-2']);
    expect(uncoveredTables({ ...c, cameras: c.cameras.map((cam) => ({ ...cam, enabled: false })) })).toEqual(['t-1', 't-2']);
  });
});
