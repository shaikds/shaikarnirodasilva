// Seed data for the mock backend: one restaurant group with three branches in Israel.
import type {
  CameraConfig,
  FloorPlanItem,
  MembershipInfo,
  Modules,
  OrgInfo,
  SiteConfig,
  SiteSettings,
  Table,
  Zone,
} from '../contracts';
import { DEFAULT_THRESHOLDS } from '../contracts';

export interface MockUser {
  user_id: string;
  org_id: string;
  email: string;
  name: string;
  locale: 'he' | 'en';
  password: string;
  memberships: MembershipInfo[];
}

export interface MockDevice {
  device_id: string;
  site_id: string;
  version: string;
  /** Seconds ago of the last heartbeat at seed time; null = never. */
  last_seen_ago_s: number | null;
  cameras: { camera_id: string; status: 'ok' | 'degraded' | 'offline'; fps: number }[];
}

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS = [
  { role: 'owner', email: 'owner@zayit.demo' },
  { role: 'manager', email: 'manager@zayit.demo' },
  { role: 'waiter', email: 'waiter@zayit.demo' },
] as const;

/** Mock VAPID application server key (a real P-256 point so browsers accept it). */
export const MOCK_VAPID_PUBLIC_KEY =
  'BCrEUmsa0Y5u5pp4MFVYVq3avSnfsi3sHa-k0cNwD-yUmXtjriH_7aCeX7qIgZ_CjhdUTLVlMMBJ5p35JnWAGjM';

export const SEED_ORG: OrgInfo = { org_id: 'org-zayit', name: 'קבוצת זית', plan: 'pro' };

export const SEED_USERS: MockUser[] = [
  {
    user_id: 'usr-owner',
    org_id: SEED_ORG.org_id,
    email: 'owner@zayit.demo',
    name: 'דנה לוי',
    locale: 'he',
    password: DEMO_PASSWORD,
    memberships: [{ role: 'owner', site_id: null }],
  },
  {
    user_id: 'usr-manager',
    org_id: SEED_ORG.org_id,
    email: 'manager@zayit.demo',
    name: 'אבי כהן',
    locale: 'he',
    password: DEMO_PASSWORD,
    memberships: [{ role: 'manager', site_id: 'site-tlv' }],
  },
  {
    user_id: 'usr-waiter',
    org_id: SEED_ORG.org_id,
    email: 'waiter@zayit.demo',
    name: 'נועה מזרחי',
    locale: 'he',
    password: DEMO_PASSWORD,
    memberships: [{ role: 'waiter', site_id: 'site-tlv' }],
  },
  {
    user_id: 'usr-waiter-hfa',
    org_id: SEED_ORG.org_id,
    email: 'waiter.haifa@zayit.demo',
    name: 'עומר שפירא',
    locale: 'he',
    password: DEMO_PASSWORD,
    memberships: [{ role: 'waiter', site_id: 'site-hfa' }],
  },
];

interface TableSpec {
  label: string;
  seats: number;
  section: string | null;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

function buildSite(
  site: Omit<SiteSettings, 'floor_plan' | 'thresholds' | 'modules'> & { modules?: Modules },
  specs: TableSpec[],
  cameras: { id: string; name: string }[],
): { settings: SiteSettings; config: SiteConfig } {
  const prefix = site.site_id.replace('site-', '');
  const tables: Table[] = specs.map((s, i) => ({
    table_id: `${prefix}-t${i + 1}`,
    label: s.label,
    seats: s.seats,
    section: s.section,
  }));
  const floor_plan: FloorPlanItem[] = specs.map((s, i) => ({
    table_id: tables[i]!.table_id,
    x: s.x,
    y: s.y,
    w: s.w ?? 1,
    h: s.h ?? 1,
  }));
  const camCfg: CameraConfig[] = cameras.map((c) => ({
    camera_id: c.id,
    name: c.name,
    source: 'rtsp',
    anchor: 'foot',
    target_fps: 5,
    privacy_masks: [],
    enabled: true,
  }));
  const hall = cameras[0]!.id;
  const zones: Zone[] = tables.map((t, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x0 = 0.05 + col * 0.18;
    const y0 = 0.1 + row * 0.28;
    return {
      zone_id: `${t.table_id}-z`,
      camera_id: hall,
      kind: 'table',
      polygon: [
        [x0, y0],
        [x0 + 0.15, y0],
        [x0 + 0.15, y0 + 0.22],
        [x0, y0 + 0.22],
      ],
      line: null,
      table_id: t.table_id,
      primary: true,
    };
  });
  const entrance = cameras[1]?.id ?? hall;
  zones.push(
    {
      zone_id: `${prefix}-queue`,
      camera_id: entrance,
      kind: 'queue',
      polygon: [
        [0.1, 0.4],
        [0.6, 0.4],
        [0.6, 0.95],
        [0.1, 0.95],
      ],
      line: null,
      table_id: null,
      primary: false,
    },
    {
      zone_id: `${prefix}-entrance`,
      camera_id: entrance,
      kind: 'entrance_line',
      polygon: null,
      line: { a: [0.1, 0.35], b: [0.6, 0.35], in_direction: 'left_to_right' },
      table_id: null,
      primary: false,
    },
    {
      zone_id: `${prefix}-staff`,
      camera_id: hall,
      kind: 'staff_area',
      polygon: [
        [0.85, 0.0],
        [1.0, 0.0],
        [1.0, 0.3],
        [0.85, 0.3],
      ],
      line: null,
      table_id: null,
      primary: false,
    },
  );
  const modules = site.modules ?? { occupancy: true, queue: true, tables: true, alerts: true };
  const thresholds = { ...DEFAULT_THRESHOLDS };
  const settings: SiteSettings = { ...site, modules, thresholds, floor_plan };
  const config: SiteConfig = {
    schema_version: '1.0',
    site_id: site.site_id,
    timezone: site.timezone,
    locale: site.locale,
    cameras: camCfg,
    tables,
    zones,
    thresholds,
    modules,
    config_version: 3,
  };
  return { settings, config };
}

export function seedSites() {
  return [
    buildSite(
      {
        site_id: 'site-tlv',
        org_id: SEED_ORG.org_id,
        name: 'זית – תל אביב',
        timezone: 'Asia/Jerusalem',
        locale: 'he',
        currency: 'ILS',
        avg_check_per_guest: 145,
      },
      [
        { label: '1', seats: 2, section: 'אולם', x: 0, y: 2 },
        { label: '2', seats: 2, section: 'אולם', x: 2, y: 2 },
        { label: '3', seats: 4, section: 'אולם', x: 4, y: 2 },
        { label: '4', seats: 4, section: 'אולם', x: 6, y: 2 },
        { label: '5', seats: 6, section: 'אולם', x: 8, y: 2, w: 2 },
        { label: '6', seats: 2, section: 'אולם', x: 0, y: 4 },
        { label: '7', seats: 4, section: 'אולם', x: 2, y: 4 },
        { label: '8', seats: 4, section: 'אולם', x: 4, y: 4 },
        { label: '9', seats: 6, section: 'אולם', x: 6, y: 4, w: 2 },
        { label: '10', seats: 8, section: 'אולם', x: 9, y: 4, w: 2, h: 2 },
        { label: 'בר 1', seats: 2, section: 'בר', x: 1, y: 0 },
        { label: 'בר 2', seats: 2, section: 'בר', x: 3, y: 0 },
        { label: 'פטיו 1', seats: 4, section: 'פטיו', x: 0, y: 6 },
        { label: 'פטיו 2', seats: 4, section: 'פטיו', x: 2, y: 6 },
      ],
      [
        { id: 'tlv-cam-hall', name: 'אולם' },
        { id: 'tlv-cam-entrance', name: 'כניסה' },
        { id: 'tlv-cam-patio', name: 'פטיו' },
      ],
    ),
    buildSite(
      {
        site_id: 'site-hfa',
        org_id: SEED_ORG.org_id,
        name: 'זית – חיפה',
        timezone: 'Asia/Jerusalem',
        locale: 'he',
        currency: 'ILS',
        avg_check_per_guest: 125,
      },
      [
        { label: '1', seats: 4, section: null, x: 0, y: 0 },
        { label: '2', seats: 4, section: null, x: 2, y: 0 },
        { label: '3', seats: 2, section: null, x: 4, y: 0 },
        { label: '4', seats: 2, section: null, x: 6, y: 0 },
        { label: '5', seats: 6, section: null, x: 0, y: 2, w: 2 },
        { label: '6', seats: 4, section: null, x: 3, y: 2 },
        { label: '7', seats: 4, section: null, x: 5, y: 2 },
        { label: '8', seats: 2, section: null, x: 0, y: 4 },
        { label: '9', seats: 2, section: null, x: 2, y: 4 },
        { label: '10', seats: 6, section: null, x: 4, y: 4, w: 2 },
      ],
      [
        { id: 'hfa-cam-hall', name: 'אולם' },
        { id: 'hfa-cam-entrance', name: 'כניסה' },
      ],
    ),
    buildSite(
      {
        site_id: 'site-jlm',
        org_id: SEED_ORG.org_id,
        name: 'זית – ירושלים',
        timezone: 'Asia/Jerusalem',
        locale: 'he',
        currency: 'ILS',
        avg_check_per_guest: 135,
      },
      [
        { label: '1', seats: 4, section: null, x: 0, y: 0 },
        { label: '2', seats: 4, section: null, x: 2, y: 0 },
        { label: '3', seats: 4, section: null, x: 4, y: 0 },
        { label: '4', seats: 2, section: null, x: 0, y: 2 },
        { label: '5', seats: 2, section: null, x: 2, y: 2 },
        { label: '6', seats: 6, section: null, x: 4, y: 2, w: 2 },
        { label: '7', seats: 4, section: null, x: 0, y: 4 },
        { label: '8', seats: 4, section: null, x: 2, y: 4 },
      ],
      [{ id: 'jlm-cam-hall', name: 'אולם' }],
    ),
  ];
}

export const SEED_DEVICES: MockDevice[] = [
  {
    device_id: 'dev-tlv-1',
    site_id: 'site-tlv',
    version: '0.1.0',
    last_seen_ago_s: 8,
    cameras: [
      { camera_id: 'tlv-cam-hall', status: 'ok', fps: 5 },
      { camera_id: 'tlv-cam-entrance', status: 'ok', fps: 5 },
      { camera_id: 'tlv-cam-patio', status: 'degraded', fps: 2.1 },
    ],
  },
  {
    device_id: 'dev-hfa-1',
    site_id: 'site-hfa',
    version: '0.1.0',
    last_seen_ago_s: 12,
    cameras: [
      { camera_id: 'hfa-cam-hall', status: 'ok', fps: 5 },
      { camera_id: 'hfa-cam-entrance', status: 'ok', fps: 4.8 },
    ],
  },
  {
    device_id: 'dev-jlm-1',
    site_id: 'site-jlm',
    version: '0.0.9',
    last_seen_ago_s: 2 * 3600,
    cameras: [{ camera_id: 'jlm-cam-hall', status: 'offline', fps: 0 }],
  },
];
