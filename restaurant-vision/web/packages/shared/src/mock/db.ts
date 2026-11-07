// In-memory mock backend state plus a live simulator that produces realistic EdgeEvents:
// tables cycling empty -> seated -> attended -> needs_bussing -> empty, alerts being raised,
// acknowledged (anonymously) and resolved, the entrance queue growing and shrinking, and
// edge heartbeats. Used by the MSW handlers in the browser (VITE_MOCK=1) and in tests.
import type {
  AlertKind,
  AlertSeverity,
  AlertView,
  DeviceStatus,
  EdgeEvent,
  LiveSnapshot,
  MembershipInfo,
  OccupancyLive,
  OrgInfo,
  PairingCodeInfo,
  PushSubscriptionOut,
  QueueLive,
  SiteConfig,
  SiteSettings,
  SiteSummary,
  TableLive,
  TableState,
  TokenPair,
} from '../contracts';
import { DEVICE_OFFLINE_AFTER_S } from '../contracts';
import { pick, randInt, shortId, uuidv7 } from './random';
import { SEED_DEVICES, SEED_ORG, SEED_USERS, seedSites, type MockUser } from './seed';

export type MockEvent = EdgeEvent;
type Listener = (event: MockEvent) => void;

interface TableRuntime {
  live: TableLive;
  sessionId: string | null;
  seatedAt: number | null;
  firstVisitAt: number | null;
  visits: number;
  maxGuests: number;
}

interface SiteRuntime {
  settings: SiteSettings;
  config: SiteConfig;
  tables: Map<string, TableRuntime>;
  alerts: Map<string, AlertView>;
  occupancy: OccupancyLive | null;
  queue: QueueLive | null;
  queueEntries: number[];
  devices: Map<string, DeviceStatus>;
  listeners: Set<Listener>;
  installedAt: number;
}

export interface MockPersistence {
  load(): string | null;
  save(data: string): void;
}

export interface MockDbOptions {
  /** Epoch seconds. */
  now?: () => number;
  rand?: () => number;
  /** Access token lifetime (default 900 s). */
  accessTtlS?: number;
  persist?: MockPersistence;
  /** Seed a busy live floor (default true). */
  seedLive?: boolean;
}

interface Persisted {
  v: 1;
  orgs: OrgInfo[];
  users: MockUser[];
  sites: { settings: SiteSettings; config: SiteConfig; installedAt: number }[];
}

const TOKEN_PREFIX = 'mock.';

function b64(json: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(json))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function unb64(text: string): unknown {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(s))));
}

export class MockDb {
  readonly orgs = new Map<string, OrgInfo>();
  readonly users = new Map<string, MockUser>();
  readonly sites = new Map<string, SiteRuntime>();
  readonly pushSubscriptions = new Map<string, PushSubscriptionOut>();
  readonly pairingCodes = new Map<string, PairingCodeInfo>();
  /** Every alert ever acknowledged, for tests: alert id -> ack time. No user identity. */
  readonly acks = new Map<string, number>();
  readonly now: () => number;
  private readonly rand: () => number;
  private readonly accessTtlS: number;
  private readonly persistence?: MockPersistence;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;

  constructor(options: MockDbOptions = {}) {
    this.now = options.now ?? (() => Date.now() / 1000);
    this.rand = options.rand ?? Math.random;
    this.accessTtlS = options.accessTtlS ?? 900;
    this.persistence = options.persist;
    this.seed(options.seedLive ?? true);
    this.restore();
  }

  // ------------------------------------------------------------------ seed and persistence

  private seed(seedLive: boolean): void {
    this.orgs.set(SEED_ORG.org_id, { ...SEED_ORG });
    for (const u of SEED_USERS) this.users.set(u.user_id, structuredClone(u));
    const now = this.now();
    for (const { settings, config } of seedSites()) {
      const site = this.addSiteRuntime(settings, config, now - 30 * 86400);
      for (const d of SEED_DEVICES.filter((x) => x.site_id === settings.site_id)) {
        const last = d.last_seen_ago_s === null ? null : now - d.last_seen_ago_s;
        site.devices.set(d.device_id, {
          device_id: d.device_id,
          version: d.version,
          last_seen_at: last,
          online: last !== null && now - last <= DEVICE_OFFLINE_AFTER_S,
          cameras: d.cameras.map((c) => ({
            camera_id: c.camera_id,
            status: c.status,
            fps: c.fps,
            last_frame_age_s: c.status === 'offline' ? null : 0.2,
          })),
          cpu_pct: last === null ? null : 38 + this.rand() * 20,
          mem_mb: last === null ? null : 610 + this.rand() * 80,
          outbox_depth: last === null ? null : 0,
        });
      }
      if (seedLive && this.edgeOnline(site)) this.seedLiveState(site);
    }
  }

  private addSiteRuntime(settings: SiteSettings, config: SiteConfig, installedAt: number): SiteRuntime {
    const tables = new Map<string, TableRuntime>();
    for (const t of config.tables) {
      tables.set(t.table_id, {
        live: {
          table_id: t.table_id,
          label: t.label,
          seats: t.seats,
          state: 'empty',
          guest_count: 0,
          since_ts: null,
          open_alert_ids: [],
        },
        sessionId: null,
        seatedAt: null,
        firstVisitAt: null,
        visits: 0,
        maxGuests: 0,
      });
    }
    const site: SiteRuntime = {
      settings,
      config,
      tables,
      alerts: new Map(),
      occupancy: null,
      queue: null,
      queueEntries: [],
      devices: new Map(),
      listeners: new Set(),
      installedAt,
    };
    this.sites.set(settings.site_id, site);
    return site;
  }

  private seedLiveState(site: SiteRuntime): void {
    const now = this.now();
    const states: TableState[] = ['empty', 'empty', 'seated', 'attended', 'attended', 'needs_bussing'];
    let i = 0;
    for (const t of site.tables.values()) {
      const state = i === 0 ? 'seated' : i === 1 ? 'attended' : pick(states, this.rand);
      i += 1;
      const ago = state === 'seated' ? randInt(40, 400, this.rand) : randInt(60, 2400, this.rand);
      t.live.state = state;
      t.live.since_ts = now - ago;
      if (state === 'seated' || state === 'attended') {
        t.live.guest_count = randInt(1, t.live.seats, this.rand);
        t.sessionId = uuidv7(Date.now(), this.rand);
        t.seatedAt = now - ago - (state === 'attended' ? randInt(60, 300, this.rand) : 0);
        t.maxGuests = t.live.guest_count;
        if (state === 'attended') {
          t.visits = 1;
          t.firstVisitAt = now - ago;
        }
      }
      if (state === 'seated' && ago > 30) {
        this.createAlert(site, 'waiter_needed', 'warn', t, now - ago + 30, false);
      }
      if (state === 'needs_bussing' && ago > 300) {
        this.createAlert(site, 'bussing_needed', 'info', t, now - ago + 300, false);
      }
    }
    // One alert someone already took, to show the anonymous "someone is on it" state.
    const first = [...site.alerts.values()][0];
    if (first) {
      first.status = 'acknowledged';
      first.acked_at = now - 20;
      first.ack_via = 'cloud';
    }
    site.queueEntries = [now - 420, now - 260, now - 90];
    site.queue = this.queueLive(site, now);
    site.occupancy = this.occupancyLive(site, now);
  }

  private restore(): void {
    const raw = this.persistence?.load();
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Persisted;
      if (data.v !== 1) return;
      for (const o of data.orgs) this.orgs.set(o.org_id, o);
      for (const u of data.users) this.users.set(u.user_id, u);
      for (const s of data.sites) {
        const existing = this.sites.get(s.settings.site_id);
        if (existing) {
          existing.settings = s.settings;
          existing.config = { ...existing.config, ...s.config, tables: existing.config.tables };
        } else {
          this.addSiteRuntime(s.settings, s.config, s.installedAt);
        }
      }
    } catch {
      // corrupted: start fresh
    }
  }

  /** Saves accounts and settings (not the live floor) so a page reload keeps signups. */
  save(): void {
    if (!this.persistence) return;
    const data: Persisted = {
      v: 1,
      orgs: [...this.orgs.values()],
      users: [...this.users.values()],
      sites: [...this.sites.values()].map((s) => ({
        settings: s.settings,
        config: s.config,
        installedAt: s.installedAt,
      })),
    };
    try {
      this.persistence.save(JSON.stringify(data));
    } catch {
      // storage full / unavailable
    }
  }

  // ------------------------------------------------------------------ auth

  issueTokens(userId: string): TokenPair {
    const now = this.now();
    const nonce = shortId('n', this.rand);
    return {
      access_token: TOKEN_PREFIX + b64({ u: userId, k: 'a', exp: now + this.accessTtlS, n: nonce }),
      refresh_token: TOKEN_PREFIX + b64({ u: userId, k: 'r', exp: now + 30 * 86400, n: nonce }),
      token_type: 'bearer',
      expires_in: this.accessTtlS,
    };
  }

  private decode(token: string | null | undefined, kind: 'a' | 'r'): MockUser | null {
    if (!token?.startsWith(TOKEN_PREFIX)) return null;
    try {
      const p = unb64(token.slice(TOKEN_PREFIX.length)) as { u: string; k: string; exp: number };
      if (p.k !== kind || p.exp <= this.now()) return null;
      return this.users.get(p.u) ?? null;
    } catch {
      return null;
    }
  }

  userForAccessToken(token: string | null | undefined): MockUser | null {
    return this.decode(token, 'a');
  }

  refresh(refreshToken: string): TokenPair | null {
    const user = this.decode(refreshToken, 'r');
    return user ? this.issueTokens(user.user_id) : null;
  }

  login(email: string, password: string): TokenPair | null {
    const user = [...this.users.values()].find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    return user ? this.issueTokens(user.user_id) : null;
  }

  role(user: MockUser): 'owner' | 'manager' | 'waiter' {
    if (user.memberships.some((m) => m.role === 'owner')) return 'owner';
    if (user.memberships.some((m) => m.role === 'manager')) return 'manager';
    return 'waiter';
  }

  /** Role the user holds for `siteId`, or null without access. */
  roleForSite(user: MockUser, siteId: string): 'owner' | 'manager' | 'waiter' | null {
    const site = this.sites.get(siteId);
    if (!site || site.settings.org_id !== user.org_id) return null;
    if (user.memberships.some((m) => m.role === 'owner')) return 'owner';
    const m = user.memberships.find((x) => x.site_id === siteId);
    return m?.role ?? null;
  }

  sitesFor(user: MockUser): SiteRuntime[] {
    return [...this.sites.values()].filter((s) => this.roleForSite(user, s.settings.site_id) !== null);
  }

  // ------------------------------------------------------------------ live view

  edgeOnline(site: SiteRuntime): boolean {
    const now = this.now();
    return [...site.devices.values()].some(
      (d) => d.last_seen_at !== null && now - d.last_seen_at <= DEVICE_OFFLINE_AFTER_S,
    );
  }

  devices(siteId: string): DeviceStatus[] {
    const site = this.sites.get(siteId);
    if (!site) return [];
    const now = this.now();
    return [...site.devices.values()].map((d) => ({
      ...d,
      online: d.last_seen_at !== null && now - d.last_seen_at <= DEVICE_OFFLINE_AFTER_S,
    }));
  }

  openAlerts(siteId: string): AlertView[] {
    const site = this.sites.get(siteId);
    if (!site) return [];
    return [...site.alerts.values()]
      .filter((a) => a.status !== 'resolved')
      .sort((a, b) => a.raised_at - b.raised_at);
  }

  allAlerts(siteId: string): AlertView[] {
    const site = this.sites.get(siteId);
    if (!site) return [];
    return [...site.alerts.values()].sort((a, b) => a.raised_at - b.raised_at);
  }

  liveSnapshot(siteId: string): LiveSnapshot | null {
    const site = this.sites.get(siteId);
    if (!site) return null;
    return structuredClone({
      site_id: siteId,
      ts: this.now(),
      tables: [...site.tables.values()].map((t) => t.live),
      occupancy: site.occupancy,
      queues: site.queue ? [site.queue] : [],
      open_alerts: this.openAlerts(siteId),
      devices: this.devices(siteId),
    });
  }

  summary(siteId: string): SiteSummary | null {
    const site = this.sites.get(siteId);
    if (!site) return null;
    const s = site.settings;
    return {
      site_id: s.site_id,
      org_id: s.org_id,
      name: s.name,
      timezone: s.timezone,
      locale: s.locale,
      currency: s.currency,
      guests: site.occupancy?.guests ?? null,
      open_alerts: this.openAlerts(siteId).length,
      edge_online: this.edgeOnline(site),
    };
  }

  subscribe(siteId: string, listener: Listener): () => void {
    const site = this.sites.get(siteId);
    site?.listeners.add(listener);
    return () => site?.listeners.delete(listener);
  }

  /** Delivers an event to the site's live subscribers. */
  emit(siteId: string, event: MockEvent): void {
    const site = this.sites.get(siteId);
    site?.listeners.forEach((l) => l(event));
  }

  private base<T extends EdgeEvent['type']>(siteId: string, type: T, ts = this.now()) {
    return { type, event_id: uuidv7(ts * 1000, this.rand), site_id: siteId, ts, schema_version: '1.0' };
  }

  // ------------------------------------------------------------------ alerts

  private createAlert(
    site: SiteRuntime,
    kind: AlertKind,
    severity: AlertSeverity,
    table: TableRuntime | null,
    ts: number,
    emit: boolean,
  ): AlertView {
    const siteId = site.settings.site_id;
    const queueZone = site.config.zones.find((z) => z.kind === 'queue')?.zone_id ?? null;
    const alert: AlertView = {
      alert_id: shortId('al', this.rand),
      site_id: siteId,
      kind,
      severity,
      status: 'open',
      table_id: table?.live.table_id ?? null,
      table_label: table?.live.label ?? null,
      zone_id: table ? null : queueZone,
      raised_at: ts,
      acked_at: null,
      ack_via: null,
      resolved_at: null,
      resolve_reason: null,
    };
    site.alerts.set(alert.alert_id, alert);
    if (table) table.live.open_alert_ids = [...table.live.open_alert_ids, alert.alert_id];
    if (emit) {
      this.emit(siteId, {
        ...this.base(siteId, 'alert.raised', ts),
        alert_id: alert.alert_id,
        kind,
        table_id: alert.table_id,
        zone_id: alert.zone_id,
        severity,
      });
    }
    return alert;
  }

  /** Raises an alert now (tests and demos). */
  raiseAlert(siteId: string, kind: AlertKind, tableId: string | null, severity: AlertSeverity = 'warn'): AlertView {
    const site = this.sites.get(siteId);
    if (!site) throw new Error(`unknown site ${siteId}`);
    const table = tableId ? (site.tables.get(tableId) ?? null) : null;
    return { ...this.createAlert(site, kind, severity, table, this.now(), true) };
  }

  /** `POST /alerts/{id}/ack`: anonymous, records time and channel only. */
  ack(alertId: string): AlertView | null {
    for (const site of this.sites.values()) {
      const alert = site.alerts.get(alertId);
      if (!alert) continue;
      if (alert.status === 'open') {
        const now = this.now();
        alert.status = 'acknowledged';
        alert.acked_at = now;
        alert.ack_via = 'cloud';
        this.acks.set(alertId, now);
        this.emit(site.settings.site_id, {
          ...this.base(site.settings.site_id, 'alert.acknowledged', now),
          alert_id: alertId,
          ack_at: now,
          via: 'cloud',
        });
      }
      return { ...alert };
    }
    return null;
  }

  alertSite(alertId: string): string | null {
    for (const site of this.sites.values()) if (site.alerts.has(alertId)) return site.settings.site_id;
    return null;
  }

  private resolveAlerts(
    site: SiteRuntime,
    table: TableRuntime | null,
    reason: 'staff_visit' | 'state_change',
    kinds?: AlertKind[],
  ): void {
    const now = this.now();
    for (const alert of site.alerts.values()) {
      if (alert.status === 'resolved') continue;
      if (table ? alert.table_id !== table.live.table_id : alert.kind !== 'long_queue') continue;
      if (kinds && !kinds.includes(alert.kind)) continue;
      alert.status = 'resolved';
      alert.resolved_at = now;
      alert.resolve_reason = reason;
      if (table) table.live.open_alert_ids = table.live.open_alert_ids.filter((id) => id !== alert.alert_id);
      this.emit(site.settings.site_id, {
        ...this.base(site.settings.site_id, 'alert.resolved', now),
        alert_id: alert.alert_id,
        resolved_at: now,
        reason,
      });
    }
    // Drop old resolved alerts to keep memory flat.
    for (const [id, a] of site.alerts) {
      if (a.status === 'resolved' && a.resolved_at !== null && now - a.resolved_at > 6 * 3600) site.alerts.delete(id);
    }
  }

  // ------------------------------------------------------------------ simulation

  private setState(site: SiteRuntime, t: TableRuntime, to: TableState, guests: number): void {
    const siteId = site.settings.site_id;
    const now = this.now();
    const from = t.live.state;
    if (from === to) return;
    if (to === 'seated') {
      t.sessionId = uuidv7(now * 1000, this.rand);
      t.seatedAt = now;
      t.firstVisitAt = null;
      t.visits = 0;
      t.maxGuests = guests;
    }
    t.live.state = to;
    t.live.guest_count = guests;
    t.live.since_ts = now;
    const sessionId = t.sessionId ?? uuidv7(now * 1000, this.rand);
    this.emit(siteId, {
      ...this.base(siteId, 'table.state_changed', now),
      table_id: t.live.table_id,
      from_state: from,
      to_state: to,
      guest_count: guests,
      session_id: sessionId,
    });
    if (to === 'needs_bussing' && t.seatedAt !== null) {
      this.emit(siteId, {
        ...this.base(siteId, 'table.session_closed', now),
        table_id: t.live.table_id,
        session_id: sessionId,
        seated_at: t.seatedAt,
        left_at: now,
        max_guests: t.maxGuests,
        first_visit_delay_s: t.firstVisitAt !== null ? t.firstVisitAt - t.seatedAt : null,
        visits: t.visits,
        bussing_delay_s: null,
      });
    }
    if (to === 'empty') t.sessionId = null;
  }

  private tableHasAck(site: SiteRuntime, t: TableRuntime): boolean {
    return t.live.open_alert_ids.some((id) => site.alerts.get(id)?.status === 'acknowledged');
  }

  private hasAlert(site: SiteRuntime, t: TableRuntime, kind: AlertKind): boolean {
    return t.live.open_alert_ids.some((id) => site.alerts.get(id)?.kind === kind);
  }

  private queueLive(site: SiteRuntime, now: number): QueueLive | null {
    const zone = site.config.zones.find((z) => z.kind === 'queue');
    if (!zone) return null;
    const waits = site.queueEntries.map((e) => now - e);
    const people = waits.length;
    return {
      zone_id: zone.zone_id,
      ts: now,
      people,
      parties_est: Math.ceil(people / 2.3),
      longest_wait_s: people ? Math.max(...waits) : 0,
      avg_wait_s: people ? waits.reduce((a, b) => a + b, 0) / people : 0,
    };
  }

  private occupancyLive(site: SiteRuntime, now: number): OccupancyLive {
    const tables = [...site.tables.values()];
    const occupied = tables.filter((t) => t.live.state === 'seated' || t.live.state === 'attended');
    const barGuests = Math.floor(this.rand() * 3);
    return {
      ts: now,
      guests: occupied.reduce((s, t) => s + t.live.guest_count, 0) + barGuests,
      tables_occupied: occupied.length,
      tables_total: tables.length,
      staff_on_floor: 3 + Math.floor(this.rand() * 3),
    };
  }

  /** One simulation step (~2 s of restaurant time) for every site with an online edge. */
  tick(): void {
    this.tickCount += 1;
    for (const site of this.sites.values()) {
      if (!this.edgeOnline(site) && site.devices.size > 0) continue;
      if (site.tables.size === 0) continue;
      this.tickSite(site);
    }
  }

  private tickSite(site: SiteRuntime): void {
    const r = this.rand;
    const now = this.now();
    const siteId = site.settings.site_id;
    const alertsOn = site.settings.modules.alerts;
    for (const t of site.tables.values()) {
      const age = now - (t.live.since_ts ?? now);
      const acked = this.tableHasAck(site, t);
      switch (t.live.state) {
        case 'empty': {
          const seatFromQueue = site.queueEntries.length > 0 ? 0.05 : 0.025;
          if (age > 8 && r() < seatFromQueue) {
            const guests = randInt(1, t.live.seats, r);
            if (site.queueEntries.length) {
              const entered = site.queueEntries.shift()!;
              const zone = site.queue?.zone_id;
              if (zone) {
                this.emit(siteId, { ...this.base(siteId, 'queue.seated', now), zone_id: zone, waited_s: now - entered });
              }
            }
            this.setState(site, t, 'seated', guests);
          }
          break;
        }
        case 'seated': {
          if (alertsOn && age > 25 && !this.hasAlert(site, t, 'waiter_needed')) {
            this.createAlert(site, 'waiter_needed', t.live.guest_count >= 5 ? 'urgent' : 'warn', t, now, true);
          }
          if (age > 6 && r() < (acked ? 0.3 : 0.04)) {
            t.visits += 1;
            t.firstVisitAt = now;
            this.setState(site, t, 'attended', t.live.guest_count);
            this.resolveAlerts(site, t, 'staff_visit');
          }
          break;
        }
        case 'attended': {
          if (r() < 0.012) {
            this.resolveAlerts(site, t, 'state_change');
            this.setState(site, t, 'needs_bussing', 0);
          } else if (alertsOn && age > 40 && r() < 0.004 && !this.hasAlert(site, t, 'checkin_needed')) {
            this.createAlert(site, 'checkin_needed', 'info', t, now, true);
          } else if (this.hasAlert(site, t, 'checkin_needed') && r() < (acked ? 0.3 : 0.05)) {
            t.visits += 1;
            this.resolveAlerts(site, t, 'staff_visit');
          } else if (r() < 0.02 && t.live.guest_count < t.live.seats) {
            // a late guest joins: no state change, guest count follows on the next transition
            t.maxGuests = Math.max(t.maxGuests, t.live.guest_count + 1);
          }
          break;
        }
        case 'needs_bussing': {
          if (alertsOn && age > 30 && !this.hasAlert(site, t, 'bussing_needed')) {
            this.createAlert(site, 'bussing_needed', 'info', t, now, true);
          }
          if (age > 5 && r() < (acked ? 0.35 : 0.06)) {
            this.resolveAlerts(site, t, 'staff_visit');
            this.setState(site, t, 'empty', 0);
          }
          break;
        }
      }
    }

    // Entrance queue.
    if (site.settings.modules.queue && site.queue) {
      if (r() < 0.22) site.queueEntries.push(now);
      if (site.queueEntries.length > 2 && r() < 0.03) {
        const idx = Math.floor(r() * site.queueEntries.length);
        const entered = site.queueEntries.splice(idx, 1)[0]!;
        if (now - entered >= site.settings.thresholds.walkaway_min_wait_s / 10) {
          this.emit(siteId, {
            ...this.base(siteId, 'queue.walkaway', now),
            zone_id: site.queue.zone_id,
            waited_s: now - entered,
            party_size_est: randInt(1, 4, r),
          });
        }
      }
      if (site.queueEntries.length > 10) site.queueEntries.shift();
      site.queue = this.queueLive(site, now);
      if (site.queue) {
        this.emit(siteId, {
          ...this.base(siteId, 'queue.snapshot', now),
          zone_id: site.queue.zone_id,
          people: site.queue.people,
          parties_est: site.queue.parties_est,
          longest_wait_s: site.queue.longest_wait_s,
          avg_wait_s: site.queue.avg_wait_s,
        });
        const long = site.queue.people >= site.settings.thresholds.long_queue_people;
        const openLong = [...site.alerts.values()].some((a) => a.kind === 'long_queue' && a.status !== 'resolved');
        if (alertsOn && long && !openLong) this.createAlert(site, 'long_queue', 'warn', null, now, true);
        if (openLong && site.queue.people <= Math.floor(site.settings.thresholds.long_queue_people / 2)) {
          this.resolveAlerts(site, null, 'state_change');
        }
      }
    }

    // Occupancy snapshot.
    if (site.settings.modules.occupancy) {
      site.occupancy = this.occupancyLive(site, now);
      this.emit(siteId, { ...this.base(siteId, 'occupancy.snapshot', now), ...site.occupancy });
    }

    // Heartbeats every ~8 ticks.
    if (this.tickCount % 8 === 0) {
      for (const d of site.devices.values()) {
        if (d.last_seen_at === null) continue;
        d.last_seen_at = now;
        d.online = true;
        d.cpu_pct = Math.round((35 + r() * 25) * 10) / 10;
        d.mem_mb = Math.round(600 + r() * 90);
        d.outbox_depth = r() < 0.9 ? 0 : randInt(1, 12, r);
        d.cameras = d.cameras.map((c) => ({
          ...c,
          fps: c.status === 'ok' ? 4.6 + Math.round(r() * 4) / 10 : c.status === 'degraded' ? 1.5 + r() : 0,
          last_frame_age_s: c.status === 'offline' ? null : Math.round(r() * 5) / 10,
        }));
        this.emit(siteId, {
          ...this.base(siteId, 'edge.heartbeat', now),
          device_id: d.device_id,
          version: d.version ?? '0.1.0',
          cameras: d.cameras,
          cpu_pct: d.cpu_pct,
          mem_mb: d.mem_mb,
          outbox_depth: d.outbox_depth,
        });
      }
    }
  }

  startSimulation(intervalMs = 2000): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stopSimulation(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  // ------------------------------------------------------------------ admin mutations

  createOrgWithOwner(input: { org_name: string; name: string; email: string; password: string; locale: 'he' | 'en' }): MockUser | null {
    if ([...this.users.values()].some((u) => u.email.toLowerCase() === input.email.toLowerCase())) return null;
    const org: OrgInfo = { org_id: shortId('org', this.rand), name: input.org_name, plan: 'pro' };
    this.orgs.set(org.org_id, org);
    const user: MockUser = {
      user_id: shortId('usr', this.rand),
      org_id: org.org_id,
      email: input.email,
      name: input.name,
      locale: input.locale,
      password: input.password,
      memberships: [{ role: 'owner', site_id: null }],
    };
    this.users.set(user.user_id, user);
    this.save();
    return user;
  }

  createSite(orgId: string, input: Pick<SiteSettings, 'name' | 'timezone' | 'locale' | 'currency' | 'avg_check_per_guest'>): SiteSettings {
    const siteId = shortId('site', this.rand);
    const settings: SiteSettings = {
      site_id: siteId,
      org_id: orgId,
      ...input,
      thresholds: seedSites()[0]!.settings.thresholds,
      modules: { occupancy: true, queue: true, tables: true, alerts: true },
      floor_plan: [],
    };
    const config: SiteConfig = {
      schema_version: '1.0',
      site_id: siteId,
      timezone: input.timezone,
      locale: input.locale,
      cameras: [],
      tables: [],
      zones: [],
      thresholds: settings.thresholds,
      modules: settings.modules,
      config_version: 0,
    };
    this.addSiteRuntime(settings, config, this.now());
    this.save();
    return structuredClone(settings);
  }

  updateSite(siteId: string, patch: Partial<SiteSettings>): SiteSettings | null {
    const site = this.sites.get(siteId);
    if (!site) return null;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined));
    site.settings = { ...site.settings, ...clean };
    site.config = {
      ...site.config,
      timezone: site.settings.timezone,
      locale: site.settings.locale,
      thresholds: site.settings.thresholds,
      modules: site.settings.modules,
      config_version: site.config.config_version + 1,
    };
    this.save();
    return structuredClone(site.settings);
  }

  createUser(orgId: string, input: { email: string; name: string; password: string; locale: 'he' | 'en'; memberships: MembershipInfo[] }): MockUser | null {
    if ([...this.users.values()].some((u) => u.email.toLowerCase() === input.email.toLowerCase())) return null;
    const user: MockUser = { user_id: shortId('usr', this.rand), org_id: orgId, ...input };
    this.users.set(user.user_id, user);
    this.save();
    return user;
  }

  createPairingCode(siteId: string): PairingCodeInfo {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(this.rand() * alphabet.length)];
    const info = { code, site_id: siteId, expires_at: this.now() + 15 * 60 };
    this.pairingCodes.set(code, info);
    return info;
  }

  pairDevice(code: string): { device_id: string; site_id: string; token: string } | null {
    const info = this.pairingCodes.get(code);
    if (!info || info.expires_at < this.now()) return null;
    this.pairingCodes.delete(code);
    const site = this.sites.get(info.site_id);
    if (!site) return null;
    const device_id = shortId('dev', this.rand);
    site.devices.set(device_id, {
      device_id,
      version: null,
      last_seen_at: null,
      online: false,
      cameras: [],
      cpu_pct: null,
      mem_mb: null,
      outbox_depth: null,
    });
    return { device_id, site_id: info.site_id, token: `mockdev.${device_id}` };
  }

  siteForDeviceToken(token: string | null): SiteRuntime | null {
    if (!token?.startsWith('mockdev.')) return null;
    const id = token.slice('mockdev.'.length);
    for (const site of this.sites.values()) if (site.devices.has(id)) return site;
    return null;
  }
}

export type { SiteRuntime, TableRuntime };
