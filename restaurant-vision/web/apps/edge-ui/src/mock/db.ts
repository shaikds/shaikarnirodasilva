// In-memory fake of the edge LAN API state, for MSW (tests and `pnpm dev:mock`). Mirrors the
// behaviour of rv_edge/runtime/local_api.py closely enough to exercise the UI: PIN + lockout,
// write-only camera credentials, config validation, coverage, alerts and a tiny live simulation.
import type {
  AlertKind,
  AlertView,
  EdgeEvent,
  LiveSnapshot,
  SiteConfig,
  TableLive,
  TableState,
} from '@rv/shared';
import { CONTRACT_SCHEMA_VERSION } from '@rv/shared';
import type {
  CameraOut,
  OptionValue,
  SetupStatus,
  SuggestNote,
  TableSuggestion,
} from '../api/types';
import { uncoveredTables, errorsOf, validateConfig } from '../lib/validation';
import { normalizeBrand, parseCameraUrl, redactUrl } from '../lib/rtsp';

export interface MockCamera {
  camera_id: string;
  kind: 'rtsp' | 'file' | 'simulated';
  /** Stored URL, credentials included (never returned as is). */
  url: string;
  loop: boolean;
  /** Non-secret options the wizard stored (`brand`, `channel`, `substream`). */
  options?: Record<string, OptionValue>;
}

export interface EdgeMockOptions {
  pin?: string | null;
  paired?: boolean;
  config?: SiteConfig | null;
  cameras?: MockCamera[];
  now?: () => number;
  /** What `suggest-tables` answers (default: the tables of the mock picture). */
  suggestions?: TableSuggestion[];
  suggestNote?: SuggestNote | null;
}

export const MOCK_SITE_ID = 'demo-site';
export const LOCKOUT_FAILURES = 5;
export const LOCKOUT_S = 30;

/** Tables drawn in the mock snapshot (normalized boxes), reused as suggestions. */
export const MOCK_PICTURE_TABLES: readonly { box: [number, number, number, number]; seats: number }[] = [
  { box: [0.1, 0.55, 0.28, 0.8], seats: 4 },
  { box: [0.4, 0.55, 0.58, 0.8], seats: 4 },
  { box: [0.7, 0.55, 0.88, 0.8], seats: 2 },
  { box: [0.25, 0.22, 0.4, 0.4], seats: 6 },
];

export function defaultSuggestions(): TableSuggestion[] {
  return MOCK_PICTURE_TABLES.map((tb, i) => {
    const [x1, y1, x2, y2] = tb.box;
    const pad = 0.02;
    return {
      suggestion_id: `s${i + 1}`,
      polygon: [
        [x1 - pad, y1 - pad],
        [x2 + pad, y1 - pad],
        [x2 + pad, y2 + pad],
        [x1 - pad, y2 + pad],
      ],
      table_box: tb.box,
      seats_est: tb.seats,
      confidence: [0.86, 0.71, 0.48, 0.33][i] ?? 0.5,
    };
  });
}

type Listener = (message: string) => void;

export class EdgeMockDb {
  pin: string | null;
  paired: boolean;
  siteId: string | null;
  deviceId: string | null;
  cloudUrl: string | null = null;
  config: SiteConfig | null;
  cameras = new Map<string, MockCamera>();
  failures = 0;
  lockedUntil = 0;
  uniformHsv: [number, number, number] | null = null;
  suggestions: TableSuggestion[];
  suggestNote: SuggestNote | null;
  alerts = new Map<string, AlertView>();
  tableState = new Map<string, { state: TableState; guests: number; since: number | null }>();
  acks = new Set<string>();
  /** Last request headers seen by a setup endpoint (tests check the PIN header). */
  lastSetupHeaders: Headers | null = null;
  private listeners = new Set<Listener>();
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly now: () => number;

  constructor(options: EdgeMockOptions = {}) {
    this.pin = options.pin ?? null;
    this.paired = options.paired ?? false;
    this.siteId = this.paired ? MOCK_SITE_ID : null;
    this.deviceId = this.paired ? 'dev-1' : null;
    this.config = options.config ?? null;
    for (const c of options.cameras ?? []) this.cameras.set(c.camera_id, c);
    this.now = options.now ?? (() => Date.now() / 1000);
    this.suggestions = options.suggestions ?? defaultSuggestions();
    this.suggestNote = options.suggestNote ?? null;
  }

  // ---------------------------------------------------------------- status
  status(): SetupStatus {
    return {
      version: '0.1.0-mock',
      pin_set: this.pin !== null,
      paired: this.paired,
      site_id: this.siteId,
      device_id: this.deviceId,
      cloud_url: this.cloudUrl,
      cloud_online: this.paired,
      last_sync_error: null,
      configured: this.config !== null,
      config_version: this.config?.config_version ?? 0,
      pending_config_push: false,
      outbox_depth: 0,
      camera_count: this.cameras.size,
      uniform_calibrated: this.uniformHsv !== null,
    };
  }

  // ---------------------------------------------------------------- PIN
  /** null when allowed; otherwise the HTTP status to answer. */
  checkPin(header: string | null): 401 | 429 | null {
    if (this.lockedUntil > Date.now()) return 429;
    if (this.pin === null) return 401;
    if (header !== this.pin) {
      this.failures += 1;
      if (this.failures >= LOCKOUT_FAILURES) {
        this.lockedUntil = Date.now() + LOCKOUT_S * 1000;
        this.failures = 0;
      }
      return 401;
    }
    this.failures = 0;
    return null;
  }

  // ---------------------------------------------------------------- cameras
  /** Like local_api.CameraOut: non-secret address parts from the stored options, else the URL. */
  cameraOut(c: MockCamera): CameraOut {
    const cfg = this.config?.cameras.find((x) => x.camera_id === c.camera_id);
    const simulated = c.kind === 'simulated';
    const parsed = c.kind === 'rtsp' ? parseCameraUrl(c.url) : null;
    const opt = c.options ?? {};
    const channel = typeof opt.channel === 'number' && opt.channel >= 1 ? opt.channel : null;
    return {
      camera_id: c.camera_id,
      kind: c.kind,
      url: simulated ? `simulated://${c.camera_id}` : redactUrl(c.url),
      has_credentials: !simulated && /:\/\/[^/]*@/.test(c.url),
      loop: c.loop,
      brand: typeof opt.brand === 'string' && opt.brand ? normalizeBrand(opt.brand) : (parsed?.brand ?? null),
      host: parsed?.host ?? null,
      port: parsed?.port ?? null,
      channel: channel ?? parsed?.channel ?? null,
      substream: typeof opt.substream === 'boolean' ? opt.substream : (parsed?.substream ?? null),
      in_config: !!cfg,
      name: cfg?.name ?? null,
      enabled: cfg?.enabled ?? null,
      status: cfg?.enabled ? 'ok' : null,
      fps: cfg?.enabled ? 5 : null,
      last_frame_age_s: cfg?.enabled ? 0.2 : null,
    };
  }

  isSimulated(cameraId: string): boolean {
    const cam = this.cameras.get(cameraId);
    const cfg = this.config?.cameras.find((c) => c.camera_id === cameraId);
    return cam?.kind === 'simulated' || cfg?.source === 'simulated';
  }

  hasCamera(cameraId: string): boolean {
    return this.cameras.has(cameraId) || !!this.config?.cameras.some((c) => c.camera_id === cameraId);
  }

  // ---------------------------------------------------------------- config
  /** Validation errors the real edge would raise (pydantic), as messages. */
  configErrors(config: SiteConfig): string[] {
    return errorsOf(validateConfig(config)).map((i) => `${i.code}: ${i.entity} ${i.id}`);
  }

  saveConfig(config: SiteConfig): SiteConfig {
    this.config = config;
    this.syncTables();
    this.broadcastSnapshot();
    return config;
  }

  coverage(): string[] {
    return this.config ? uncoveredTables(this.config) : [];
  }

  // ---------------------------------------------------------------- live
  private syncTables() {
    const ids = new Set(this.config?.tables.map((t) => t.table_id));
    for (const id of [...this.tableState.keys()]) if (!ids.has(id)) this.tableState.delete(id);
    for (const t of this.config?.tables ?? [])
      if (!this.tableState.has(t.table_id)) this.tableState.set(t.table_id, { state: 'empty', guests: 0, since: null });
  }

  liveSnapshot(): LiveSnapshot {
    this.syncTables();
    const tables: TableLive[] = (this.config?.tables ?? []).map((t) => {
      const s = this.tableState.get(t.table_id)!;
      return {
        table_id: t.table_id,
        label: t.label,
        seats: t.seats,
        state: s.state,
        guest_count: s.guests,
        since_ts: s.since,
        open_alert_ids: [...this.alerts.values()].filter((a) => a.table_id === t.table_id).map((a) => a.alert_id),
      };
    });
    const occupied = tables.filter((t) => t.guest_count > 0);
    return {
      site_id: this.config?.site_id ?? this.siteId ?? MOCK_SITE_ID,
      ts: this.now(),
      tables,
      occupancy: tables.length
        ? {
            ts: this.now(),
            guests: occupied.reduce((n, t) => n + t.guest_count, 0),
            tables_occupied: occupied.length,
            tables_total: tables.length,
            staff_on_floor: 2,
          }
        : null,
      queues: [],
      open_alerts: [...this.alerts.values()].sort((a, b) => a.raised_at - b.raised_at),
      devices: [
        {
          device_id: this.deviceId ?? 'edge-local',
          version: '0.1.0-mock',
          last_seen_at: this.now(),
          online: true,
          cameras: (this.config?.cameras ?? [])
            .filter((c) => c.enabled)
            .map((c) => ({ camera_id: c.camera_id, status: 'ok' as const, fps: 5, last_frame_age_s: 0.2 })),
          cpu_pct: 18,
          mem_mb: 420,
          outbox_depth: 0,
          local_url: 'http://192.168.1.20:8787',
        },
      ],
    };
  }

  private eventBase() {
    this.seq += 1;
    const hex = this.seq.toString(16).padStart(12, '0');
    return {
      event_id: `01890000-0000-7000-8000-${hex}`,
      site_id: this.liveSnapshot().site_id,
      ts: this.now(),
      schema_version: CONTRACT_SCHEMA_VERSION,
    };
  }

  private emit(event: EdgeEvent) {
    const msg = JSON.stringify(event);
    this.listeners.forEach((l) => l(msg));
  }

  broadcastSnapshot() {
    const msg = JSON.stringify({ type: 'live.snapshot', snapshot: this.liveSnapshot() });
    this.listeners.forEach((l) => l(msg));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTableState(tableId: string, state: TableState, guests: number) {
    const prev = this.tableState.get(tableId);
    // Like the edge: a seating is confirmed after `seat_confirm_s`; `since_ts` is backdated.
    const since = state === 'seated' ? this.now() - 20 : this.now();
    this.tableState.set(tableId, { state, guests, since });
    this.emit({
      ...this.eventBase(),
      type: 'table.state_changed',
      table_id: tableId,
      from_state: prev?.state ?? 'empty',
      to_state: state,
      guest_count: guests,
      session_id: `sess-${tableId}`,
      since_ts: since,
    } as EdgeEvent);
  }

  raiseAlert(kind: AlertKind, tableId: string | null, severity: AlertView['severity'] = 'warn'): AlertView {
    const base = this.eventBase();
    const alertId = `al-${this.seq}`;
    const label = this.config?.tables.find((t) => t.table_id === tableId)?.label ?? null;
    const view: AlertView = {
      alert_id: alertId,
      site_id: base.site_id,
      kind,
      severity,
      status: 'open',
      table_id: tableId,
      table_label: label,
      zone_id: null,
      raised_at: base.ts,
      acked_at: null,
      ack_via: null,
      resolved_at: null,
      resolve_reason: null,
      // When the condition began (e.g. the guests sat down), from the table's current state.
      condition_since_ts: (tableId ? this.tableState.get(tableId)?.since : null) ?? base.ts,
    };
    this.alerts.set(alertId, view);
    this.emit({
      ...base,
      type: 'alert.raised',
      alert_id: alertId,
      kind,
      table_id: tableId,
      zone_id: null,
      severity,
      condition_since_ts: view.condition_since_ts,
    } as EdgeEvent);
    return view;
  }

  ack(alertId: string): AlertView | null {
    const a = this.alerts.get(alertId);
    if (!a) return null;
    if (a.status === 'open') {
      const at = this.now();
      const next: AlertView = { ...a, status: 'acknowledged', acked_at: at, ack_via: 'local' };
      this.alerts.set(alertId, next);
      this.acks.add(alertId);
      this.emit({ ...this.eventBase(), type: 'alert.acknowledged', alert_id: alertId, ack_at: at, via: 'local' } as EdgeEvent);
    }
    return this.alerts.get(alertId)!;
  }

  resolve(alertId: string) {
    if (!this.alerts.delete(alertId)) return;
    this.emit({
      ...this.eventBase(),
      type: 'alert.resolved',
      alert_id: alertId,
      resolved_at: this.now(),
      reason: 'staff_visit',
    } as EdgeEvent);
  }

  /** One simulation step: a table changes state, sometimes an alert is raised or resolved. */
  tick() {
    const tables = this.config?.tables ?? [];
    if (tables.length === 0) return;
    const t = tables[Math.floor(Math.random() * tables.length)]!;
    const s = this.tableState.get(t.table_id)?.state ?? 'empty';
    const next: Record<TableState, TableState> = {
      empty: 'seated',
      seated: 'attended',
      attended: 'needs_bussing',
      needs_bussing: 'empty',
    };
    const to = next[s];
    this.setTableState(t.table_id, to, to === 'seated' || to === 'attended' ? Math.max(1, Math.min(t.seats, 2)) : 0);
    if (to === 'seated' && Math.random() < 0.6) this.raiseAlert('waiter_needed', t.table_id);
    if (to === 'attended') {
      for (const a of this.alerts.values()) if (a.table_id === t.table_id) this.resolve(a.alert_id);
    }
  }

  startSimulation(ms = 4000) {
    this.stopSimulation();
    this.timer = setInterval(() => this.tick(), ms);
  }

  stopSimulation() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** A neutral drawing like the edge's simulated-camera placeholder: tables + grey people boxes. */
export function mockSnapshotSvg(label: string, masks: readonly (readonly (readonly number[])[])[] = []): string {
  const W = 640;
  const H = 360;
  const rect = ([x1, y1, x2, y2]: readonly number[], fill: string, extra = '') =>
    `<rect x="${x1! * W}" y="${y1! * H}" width="${(x2! - x1!) * W}" height="${(y2! - y1!) * H}" fill="${fill}" ${extra}/>`;
  const tables = MOCK_PICTURE_TABLES.map((tb) => rect(tb.box, '#b08968', 'rx="6"')).join('');
  const people = [
    [0.12, 0.42, 0.17, 0.62],
    [0.21, 0.44, 0.26, 0.63],
    [0.6, 0.3, 0.65, 0.58],
  ]
    .map((b) => rect(b, '#8a8a8a', 'rx="8" filter="url(#blur)"'))
    .join('');
  const maskPaths = masks
    .filter((m) => m.length >= 3)
    .map((m) => `<polygon points="${m.map((p) => `${p[0]! * W},${p[1]! * H}`).join(' ')}" fill="#000"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><filter id="blur"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="${W}" height="${H}" fill="#ececec"/>
<rect y="${H * 0.9}" width="${W}" height="${H * 0.1}" fill="#d6d3d1"/>
<rect x="${W * 0.82}" y="${H * 0.08}" width="${W * 0.14}" height="${H * 0.3}" fill="#cbd5e1"/>
${tables}${people}${maskPaths}
<text x="12" y="28" font-family="sans-serif" font-size="18" fill="#5a5a5a">${label.replace(/[<&>]/g, '')}</text>
</svg>`;
}
