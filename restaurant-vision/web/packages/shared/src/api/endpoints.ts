// Typed functions for every endpoint of architecture 7.3 (`/api/v1`). Shapes come from the
// generated contract types; the endpoint -> model map is in rv_contracts/api.py.
import type {
  AlertView,
  BranchComparison,
  Bucket,
  CommandsPage,
  DeviceStatus,
  EdgeEvent,
  EventsAccepted,
  HealthStatus,
  LiveSnapshot,
  LoginRequest,
  Me,
  MetricsSummary,
  OrgInfo,
  OrgUser,
  PairingCodeInfo,
  PairRequest,
  PairResponse,
  PushSubscriptionIn,
  PushSubscriptionOut,
  ShiftReport,
  SignupRequest,
  SiteConfig,
  SiteCreate,
  SiteSettings,
  SiteSettingsPatch,
  SiteSummary,
  TableStats,
  Timeseries,
  TimeseriesMetric,
  TokenPair,
  UserCreate,
  UserUpdate,
  VapidPublicKey,
} from '../contracts';
import type { ApiClient } from './client';

/** Half-open range `[from, to)` in epoch seconds. */
export interface TimeRange {
  from: number;
  to: number;
}

export interface TimeseriesQuery extends TimeRange {
  metric: TimeseriesMetric;
  bucket?: Bucket;
}

export type AlertStatusFilter = 'open' | 'all';

const enc = encodeURIComponent;

export function createRvApi(client: ApiClient) {
  const r = client.request;
  return {
    // ---------------------------------------------------------------- auth and tenancy
    signup: (body: SignupRequest) =>
      r<TokenPair>('/auth/signup', { method: 'POST', body, auth: false }),
    login: (body: LoginRequest) =>
      r<TokenPair>('/auth/login', { method: 'POST', body, auth: false }),
    refreshTokens: (refresh_token: string) =>
      r<TokenPair>('/auth/refresh', { method: 'POST', body: { refresh_token }, auth: false }),
    me: (signal?: AbortSignal) => r<Me>('/me', { signal }),

    getOrg: (orgId: string, signal?: AbortSignal) => r<OrgInfo>(`/orgs/${enc(orgId)}`, { signal }),
    listSites: (orgId: string, signal?: AbortSignal) =>
      r<SiteSummary[]>(`/orgs/${enc(orgId)}/sites`, { signal }),
    createSite: (orgId: string, body: SiteCreate) =>
      r<SiteSettings>(`/orgs/${enc(orgId)}/sites`, { method: 'POST', body }),
    getSite: (siteId: string, signal?: AbortSignal) =>
      r<SiteSettings>(`/sites/${enc(siteId)}`, { signal }),
    updateSite: (siteId: string, body: SiteSettingsPatch) =>
      r<SiteSettings>(`/sites/${enc(siteId)}`, { method: 'PATCH', body }),

    listUsers: (orgId: string, signal?: AbortSignal) =>
      r<OrgUser[]>(`/orgs/${enc(orgId)}/users`, { signal }),
    createUser: (orgId: string, body: UserCreate) =>
      r<OrgUser>(`/orgs/${enc(orgId)}/users`, { method: 'POST', body }),
    updateUser: (orgId: string, userId: string, body: UserUpdate) =>
      r<OrgUser>(`/orgs/${enc(orgId)}/users/${enc(userId)}`, { method: 'PATCH', body }),
    deleteUser: (orgId: string, userId: string) =>
      r<void>(`/orgs/${enc(orgId)}/users/${enc(userId)}`, { method: 'DELETE' }),

    createPairingCode: (siteId: string) =>
      r<PairingCodeInfo>(`/sites/${enc(siteId)}/devices/pairing-code`, { method: 'POST' }),
    listDevices: (siteId: string, signal?: AbortSignal) =>
      r<DeviceStatus[]>(`/sites/${enc(siteId)}/devices`, { signal }),

    // ---------------------------------------------------------------- edge (device token)
    edgePair: (body: PairRequest) =>
      r<PairResponse>('/edge/pair', { method: 'POST', body, auth: false }),
    edgePostEvents: (deviceToken: string, events: EdgeEvent[]) =>
      r<EventsAccepted>('/edge/events', { method: 'POST', body: { events }, token: deviceToken }),
    edgeGetConfig: (deviceToken: string) => r<SiteConfig>('/edge/config', { token: deviceToken }),
    edgePutConfig: (deviceToken: string, body: SiteConfig) =>
      r<SiteConfig>('/edge/config', { method: 'PUT', body, token: deviceToken }),
    edgeCommands: (deviceToken: string, after?: string) =>
      r<CommandsPage>('/edge/commands', { query: { after }, token: deviceToken }),

    // ---------------------------------------------------------------- live and alerts
    getSiteConfig: (siteId: string, signal?: AbortSignal) =>
      r<SiteConfig>(`/sites/${enc(siteId)}/config`, { signal }),
    getLive: (siteId: string, signal?: AbortSignal) =>
      r<LiveSnapshot>(`/sites/${enc(siteId)}/live`, { signal }),
    listAlerts: (
      siteId: string,
      params: { status?: AlertStatusFilter; from?: number; to?: number } = {},
      signal?: AbortSignal,
    ) => r<AlertView[]>(`/sites/${enc(siteId)}/alerts`, { query: params, signal }),
    ackAlert: (alertId: string) => r<AlertView>(`/alerts/${enc(alertId)}/ack`, { method: 'POST' }),

    // ---------------------------------------------------------------- metrics and reports
    getMetricsSummary: (siteId: string, range: TimeRange, signal?: AbortSignal) =>
      r<MetricsSummary>(`/sites/${enc(siteId)}/metrics/summary`, { query: { ...range }, signal }),
    getTimeseries: (siteId: string, q: TimeseriesQuery, signal?: AbortSignal) =>
      r<Timeseries>(`/sites/${enc(siteId)}/metrics/timeseries`, {
        query: { metric: q.metric, bucket: q.bucket ?? '15m', from: q.from, to: q.to },
        signal,
      }),
    getTableStats: (siteId: string, range: TimeRange, signal?: AbortSignal) =>
      r<TableStats[]>(`/sites/${enc(siteId)}/tables/stats`, { query: { ...range }, signal }),
    getShiftReport: (siteId: string, date: string, signal?: AbortSignal) =>
      r<ShiftReport>(`/sites/${enc(siteId)}/reports/shift`, { query: { date }, signal }),
    compareBranches: (orgId: string, range: TimeRange, signal?: AbortSignal) =>
      r<BranchComparison>(`/orgs/${enc(orgId)}/reports/compare`, { query: { ...range }, signal }),

    // ---------------------------------------------------------------- push and health
    getVapidPublicKey: (signal?: AbortSignal) =>
      r<VapidPublicKey>('/push/vapid-public-key', { signal }),
    createPushSubscription: (body: PushSubscriptionIn) =>
      r<PushSubscriptionOut>('/push/subscriptions', { method: 'POST', body }),
    deletePushSubscription: (subscriptionId: string) =>
      r<void>(`/push/subscriptions/${enc(subscriptionId)}`, { method: 'DELETE' }),
    health: () => r<HealthStatus>('/healthz', { auth: false }),

    /** URL of the live WebSocket for a site, with the current access token. */
    liveSocketUrl: (siteId: string) =>
      client.wsUrl({ token: client.auth?.getAccessToken() ?? '', site_id: siteId }),
  };
}

export type RvApi = ReturnType<typeof createRvApi>;
