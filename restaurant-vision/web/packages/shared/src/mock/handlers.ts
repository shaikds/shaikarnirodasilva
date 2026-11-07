// MSW handlers for every endpoint of architecture 7.3 plus the live WebSocket.
// Paths use a `*` origin so they match any VITE_API_URL (and the test origin).
import { http, HttpResponse, ws, type HttpHandler, type WebSocketHandler } from 'msw';
import type {
  Bucket,
  LoginRequest,
  MembershipInfo,
  PushSubscriptionIn,
  SignupRequest,
  SiteCreate,
  SiteSettingsPatch,
  Thresholds,
  TimeseriesMetric,
  UserCreate,
  UserUpdate,
} from '../contracts';
import { DEFAULT_THRESHOLDS } from '../contracts';
import type { MockDb } from './db';
import * as metrics from './metrics';
import { shortId } from './random';
import { MOCK_VAPID_PUBLIC_KEY, type MockUser } from './seed';

const API = '*/api/v1';

const detail = (status: number, message: string) => HttpResponse.json({ detail: message }, { status });

function bearer(request: Request): string | null {
  const h = request.headers.get('Authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

type Role = 'owner' | 'manager' | 'waiter';

function num(url: URL, key: string, fallback: number): number {
  const v = url.searchParams.get(key);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function rangeOf(url: URL, now: number): { from: number; to: number } {
  return { from: num(url, 'from', now - 86400), to: num(url, 'to', now) };
}

const THRESHOLD_INT = new Set(['long_queue_people']);

function validThresholds(t: Thresholds | null | undefined): string | null {
  if (!t) return null;
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]) {
    const v = t[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return `${key} must be > 0`;
    if (THRESHOLD_INT.has(key) && !Number.isInteger(v)) return `${key} must be an integer`;
  }
  if (t.track_id_ttl_h > 24) return 'track_id_ttl_h must be <= 24';
  return null;
}

function validMemberships(db: MockDb, orgId: string, ms: MembershipInfo[]): string | null {
  if (!ms.length) return 'at least one membership';
  for (const m of ms) {
    if (m.role === 'owner' && m.site_id !== null) return 'owner memberships cover all sites';
    if (m.role !== 'owner') {
      if (!m.site_id) return `${m.role} memberships need a site_id`;
      const site = db.sites.get(m.site_id);
      if (!site || site.settings.org_id !== orgId) return 'unknown site';
    }
  }
  return null;
}

export function createHandlers(db: MockDb): (HttpHandler | WebSocketHandler)[] {
  /** Resolves the user or returns an error response. */
  function authed(request: Request): MockUser | Response {
    const user = db.userForAccessToken(bearer(request));
    return user ?? detail(401, 'Not authenticated');
  }

  function siteAccess(request: Request, siteId: string, allowed: Role[]): MockUser | Response {
    const user = authed(request);
    if (user instanceof Response) return user;
    if (!db.sites.has(siteId)) return detail(404, 'Site not found');
    const role = db.roleForSite(user, siteId);
    if (!role) return detail(404, 'Site not found');
    if (!allowed.includes(role)) return detail(403, 'Forbidden');
    return user;
  }

  function orgAccess(request: Request, orgId: string, allowed: Role[]): MockUser | Response {
    const user = authed(request);
    if (user instanceof Response) return user;
    if (user.org_id !== orgId) return detail(404, 'Organization not found');
    if (!allowed.includes(db.role(user))) return detail(403, 'Forbidden');
    return user;
  }

  const orgUser = (u: MockUser) => ({
    user_id: u.user_id,
    email: u.email,
    name: u.name,
    locale: u.locale,
    memberships: u.memberships,
  });

  const all: Role[] = ['owner', 'manager', 'waiter'];
  const staff: Role[] = ['owner', 'manager'];
  const owner: Role[] = ['owner'];

  const liveSocket = ws.link('*/api/v1/ws');

  return [
    // ------------------------------------------------------------ auth
    http.post(`${API}/auth/signup`, async ({ request }) => {
      const body = (await request.json()) as SignupRequest;
      if (!body.email || !body.password || body.password.length < 8 || !body.org_name || !body.name) {
        return detail(422, 'Invalid signup data');
      }
      const user = db.createOrgWithOwner({ ...body, locale: body.locale ?? 'he' });
      if (!user) return detail(409, 'Email already registered');
      return HttpResponse.json(db.issueTokens(user.user_id), { status: 201 });
    }),
    http.post(`${API}/auth/login`, async ({ request }) => {
      const body = (await request.json()) as LoginRequest;
      const pair = db.login(body.email ?? '', body.password ?? '');
      return pair ? HttpResponse.json(pair) : detail(401, 'Invalid email or password');
    }),
    http.post(`${API}/auth/refresh`, async ({ request }) => {
      const body = (await request.json()) as { refresh_token?: string };
      const pair = db.refresh(body.refresh_token ?? '');
      return pair ? HttpResponse.json(pair) : detail(401, 'Invalid refresh token');
    }),
    http.get(`${API}/me`, ({ request }) => {
      const user = authed(request);
      if (user instanceof Response) return user;
      return HttpResponse.json({
        user: { user_id: user.user_id, email: user.email, name: user.name, locale: user.locale },
        org: db.orgs.get(user.org_id),
        memberships: user.memberships,
        sites: db.sitesFor(user).map((s) => ({ site_id: s.settings.site_id, name: s.settings.name })),
      });
    }),

    // ------------------------------------------------------------ orgs and sites
    http.get(`${API}/orgs/:orgId`, ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), all);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.orgs.get(user.org_id));
    }),
    http.get(`${API}/orgs/:orgId/sites`, ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), all);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.sitesFor(user).map((s) => db.summary(s.settings.site_id)));
    }),
    http.post(`${API}/orgs/:orgId/sites`, async ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), owner);
      if (user instanceof Response) return user;
      const body = (await request.json()) as SiteCreate;
      if (!body.name?.trim() || !body.timezone) return detail(422, 'name and timezone are required');
      return HttpResponse.json(
        db.createSite(user.org_id, {
          name: body.name.trim(),
          timezone: body.timezone,
          locale: body.locale ?? 'he',
          currency: body.currency ?? 'ILS',
          avg_check_per_guest: body.avg_check_per_guest ?? 0,
        }),
        { status: 201 },
      );
    }),
    http.get(`${API}/sites/:siteId`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.sites.get(siteId)!.settings);
    }),
    http.patch(`${API}/sites/:siteId`, async ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      const patch = (await request.json()) as SiteSettingsPatch;
      if (db.roleForSite(user, siteId) === 'manager') {
        const keys = Object.keys(patch).filter((k) => patch[k as keyof SiteSettingsPatch] != null);
        if (keys.some((k) => k !== 'thresholds')) return detail(403, 'Managers can change thresholds only');
      }
      const err = validThresholds(patch.thresholds);
      if (err) return detail(422, err);
      if (patch.avg_check_per_guest != null && patch.avg_check_per_guest < 0) return detail(422, 'avg_check_per_guest must be >= 0');
      if (patch.floor_plan) {
        const ids = new Set(db.sites.get(siteId)!.config.tables.map((t) => t.table_id));
        if (patch.floor_plan.some((f) => !ids.has(f.table_id))) return detail(422, 'unknown table_id in floor_plan');
      }
      const { floor_plan, thresholds, modules, ...rest } = patch;
      return HttpResponse.json(
        db.updateSite(siteId, {
          ...(rest as object),
          ...(floor_plan ? { floor_plan } : {}),
          ...(thresholds ? { thresholds } : {}),
          ...(modules ? { modules } : {}),
        }),
      );
    }),
    http.get(`${API}/sites/:siteId/config`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.sites.get(siteId)!.config);
    }),

    // ------------------------------------------------------------ users
    http.get(`${API}/orgs/:orgId/users`, ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), owner);
      if (user instanceof Response) return user;
      return HttpResponse.json(
        [...db.users.values()].filter((u) => u.org_id === user.org_id).map(orgUser),
      );
    }),
    http.post(`${API}/orgs/:orgId/users`, async ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), owner);
      if (user instanceof Response) return user;
      const body = (await request.json()) as UserCreate;
      if (!body.email || !body.name || !body.password || body.password.length < 8) return detail(422, 'Invalid user');
      const err = validMemberships(db, user.org_id, body.memberships ?? []);
      if (err) return detail(422, err);
      const created = db.createUser(user.org_id, { ...body, locale: body.locale ?? 'he' });
      return created ? HttpResponse.json(orgUser(created), { status: 201 }) : detail(409, 'Email already exists');
    }),
    http.patch(`${API}/orgs/:orgId/users/:userId`, async ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), owner);
      if (user instanceof Response) return user;
      const target = db.users.get(String(params.userId));
      if (!target || target.org_id !== user.org_id) return detail(404, 'User not found');
      const body = (await request.json()) as UserUpdate;
      if (body.memberships) {
        const err = validMemberships(db, user.org_id, body.memberships);
        if (err) return detail(422, err);
        if (target.user_id === user.user_id && !body.memberships.some((m) => m.role === 'owner')) {
          return detail(400, 'You cannot remove your own owner role');
        }
        target.memberships = body.memberships;
      }
      if (body.name) target.name = body.name;
      if (body.locale) target.locale = body.locale;
      if (body.password) target.password = body.password;
      db.save();
      return HttpResponse.json(orgUser(target));
    }),
    http.delete(`${API}/orgs/:orgId/users/:userId`, ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), owner);
      if (user instanceof Response) return user;
      const target = db.users.get(String(params.userId));
      if (!target || target.org_id !== user.org_id) return detail(404, 'User not found');
      if (target.user_id === user.user_id) return detail(400, 'You cannot delete yourself');
      db.users.delete(target.user_id);
      db.save();
      return new HttpResponse(null, { status: 204 });
    }),

    // ------------------------------------------------------------ devices
    http.post(`${API}/sites/:siteId/devices/pairing-code`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, owner);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.createPairingCode(siteId), { status: 201 });
    }),
    http.get(`${API}/sites/:siteId/devices`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.devices(siteId));
    }),

    // ------------------------------------------------------------ edge (device token)
    http.post(`${API}/edge/pair`, async ({ request }) => {
      const body = (await request.json()) as { code?: string };
      const res = db.pairDevice(String(body.code ?? '').toUpperCase());
      return res ? HttpResponse.json(res) : detail(404, 'Invalid or expired pairing code');
    }),
    http.post(`${API}/edge/events`, async ({ request }) => {
      const site = db.siteForDeviceToken(bearer(request));
      if (!site) return detail(401, 'Invalid device token');
      const body = (await request.json()) as { events?: unknown[] };
      const events = Array.isArray(body.events) ? body.events : [];
      for (const e of events) db.emit(site.settings.site_id, e as never);
      return HttpResponse.json({ accepted: events.length, duplicates: 0 });
    }),
    http.get(`${API}/edge/config`, ({ request }) => {
      const site = db.siteForDeviceToken(bearer(request));
      return site ? HttpResponse.json(site.config) : detail(401, 'Invalid device token');
    }),
    http.put(`${API}/edge/config`, async ({ request }) => {
      const site = db.siteForDeviceToken(bearer(request));
      if (!site) return detail(401, 'Invalid device token');
      const config = (await request.json()) as typeof site.config;
      site.config = { ...config, config_version: site.config.config_version + 1 };
      db.save();
      return HttpResponse.json(site.config);
    }),
    http.get(`${API}/edge/commands`, ({ request }) => {
      const site = db.siteForDeviceToken(bearer(request));
      if (!site) return detail(401, 'Invalid device token');
      const after = new URL(request.url).searchParams.get('after') ?? '0';
      return HttpResponse.json({ cursor: after, commands: [] });
    }),

    // ------------------------------------------------------------ live and alerts
    http.get(`${API}/sites/:siteId/live`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, all);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.liveSnapshot(siteId));
    }),
    http.get(`${API}/sites/:siteId/alerts`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, all);
      if (user instanceof Response) return user;
      const url = new URL(request.url);
      const status = url.searchParams.get('status') ?? 'open';
      let alerts = status === 'all' ? db.allAlerts(siteId) : db.openAlerts(siteId);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (from) alerts = alerts.filter((a) => a.raised_at >= Number(from));
      if (to) alerts = alerts.filter((a) => a.raised_at < Number(to));
      return HttpResponse.json(alerts);
    }),
    http.post(`${API}/alerts/:alertId/ack`, ({ request, params }) => {
      const alertId = String(params.alertId);
      const siteId = db.alertSite(alertId);
      if (!siteId) return detail(404, 'Alert not found');
      const user = siteAccess(request, siteId, all);
      if (user instanceof Response) return user;
      return HttpResponse.json(db.ack(alertId));
    }),

    // ------------------------------------------------------------ metrics and reports
    http.get(`${API}/sites/:siteId/metrics/summary`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      const s = db.sites.get(siteId)!;
      const { from, to } = rangeOf(new URL(request.url), db.now());
      return HttpResponse.json(
        metrics.summary({ settings: s.settings, tables: s.config.tables, installedAt: s.installedAt }, from, to, db.now()),
      );
    }),
    http.get(`${API}/sites/:siteId/metrics/timeseries`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      const url = new URL(request.url);
      const metric = (url.searchParams.get('metric') ?? 'occupancy') as TimeseriesMetric;
      const bucket = (url.searchParams.get('bucket') ?? '15m') as Bucket;
      if (!['occupancy', 'queue', 'walkaways', 'response_time'].includes(metric)) return detail(422, 'unknown metric');
      if (!['5m', '15m', '1h', '1d'].includes(bucket)) return detail(422, 'unknown bucket');
      const s = db.sites.get(siteId)!;
      const { from, to } = rangeOf(url, db.now());
      return HttpResponse.json(
        metrics.timeseries({ settings: s.settings, tables: s.config.tables, installedAt: s.installedAt }, metric, bucket, from, to, db.now()),
      );
    }),
    http.get(`${API}/sites/:siteId/tables/stats`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      const s = db.sites.get(siteId)!;
      const { from, to } = rangeOf(new URL(request.url), db.now());
      return HttpResponse.json(
        metrics.tableStats({ settings: s.settings, tables: s.config.tables, installedAt: s.installedAt }, from, to, db.now()),
      );
    }),
    http.get(`${API}/sites/:siteId/reports/shift`, ({ request, params }) => {
      const siteId = String(params.siteId);
      const user = siteAccess(request, siteId, staff);
      if (user instanceof Response) return user;
      const date = new URL(request.url).searchParams.get('date') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return detail(422, 'date must be YYYY-MM-DD');
      const s = db.sites.get(siteId)!;
      return HttpResponse.json(
        metrics.shiftReport({ settings: s.settings, tables: s.config.tables, installedAt: s.installedAt }, date, db.now()),
      );
    }),
    http.get(`${API}/orgs/:orgId/reports/compare`, ({ request, params }) => {
      const user = orgAccess(request, String(params.orgId), owner);
      if (user instanceof Response) return user;
      const { from, to } = rangeOf(new URL(request.url), db.now());
      return HttpResponse.json({
        org_id: user.org_id,
        from_ts: from,
        to_ts: to,
        sites: db
          .sitesFor(user)
          .map((s) =>
            metrics.summary({ settings: s.settings, tables: s.config.tables, installedAt: s.installedAt }, from, to, db.now()),
          ),
      });
    }),

    // ------------------------------------------------------------ push and health
    http.get(`${API}/push/vapid-public-key`, ({ request }) => {
      const user = authed(request);
      if (user instanceof Response) return user;
      return HttpResponse.json({ public_key: MOCK_VAPID_PUBLIC_KEY });
    }),
    http.post(`${API}/push/subscriptions`, async ({ request }) => {
      const body = (await request.json()) as PushSubscriptionIn;
      const user = siteAccess(request, body.site_id, all);
      if (user instanceof Response) return user;
      if (!body.endpoint?.startsWith('https://') || !body.keys?.p256dh || !body.keys?.auth) {
        return detail(422, 'Invalid subscription');
      }
      const sub = { subscription_id: shortId('sub'), site_id: body.site_id, endpoint: body.endpoint };
      db.pushSubscriptions.set(sub.subscription_id, sub);
      return HttpResponse.json(sub, { status: 201 });
    }),
    http.delete(`${API}/push/subscriptions/:id`, ({ request, params }) => {
      const user = authed(request);
      if (user instanceof Response) return user;
      db.pushSubscriptions.delete(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/healthz`, () => HttpResponse.json({ status: 'ok', version: 'mock' })),

    // ------------------------------------------------------------ live WebSocket
    liveSocket.addEventListener('connection', ({ client }) => {
      const url = new URL(client.url);
      const user = db.userForAccessToken(url.searchParams.get('token'));
      if (!user) {
        client.close(4401, 'unauthorized');
        return;
      }
      const siteId = url.searchParams.get('site_id') ?? '';
      if (!db.roleForSite(user, siteId)) {
        client.close(4403, 'forbidden');
        return;
      }
      const unsubscribe = db.subscribe(siteId, (event) => client.send(JSON.stringify(event)));
      client.addEventListener('close', unsubscribe);
    }),
  ];
}
