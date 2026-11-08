// Shared test data: a small valid SiteConfig.
import { DEFAULT_THRESHOLDS, type SiteConfig } from '@rv/shared';

export function sampleConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    schema_version: '1.0',
    site_id: 'demo-site',
    timezone: 'Asia/Jerusalem',
    locale: 'he',
    cameras: [
      {
        camera_id: 'dining',
        name: 'Dining room',
        source: 'rtsp',
        anchor: 'foot',
        target_fps: 5,
        privacy_masks: [],
        enabled: true,
      },
    ],
    tables: [
      { table_id: 't-1', label: '1', seats: 4, section: null },
      { table_id: 't-2', label: '2', seats: 2, section: 'Patio' },
    ],
    zones: [
      {
        zone_id: 'zone-table-1',
        camera_id: 'dining',
        kind: 'table',
        polygon: [
          [0.1, 0.5],
          [0.3, 0.5],
          [0.3, 0.8],
          [0.1, 0.8],
        ],
        line: null,
        table_id: 't-1',
        primary: true,
      },
    ],
    thresholds: { ...DEFAULT_THRESHOLDS, seat_confirm_s: 12 },
    modules: { occupancy: true, queue: false, tables: true, alerts: true },
    config_version: 3,
    ...overrides,
  };
}
