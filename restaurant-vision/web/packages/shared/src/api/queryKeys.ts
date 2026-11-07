import type { TimeRange, TimeseriesQuery } from './endpoints';

/** React Query keys. Site-scoped keys start with `['site', siteId]` for easy invalidation. */
export const queryKeys = {
  me: ['me'] as const,
  org: (orgId: string) => ['org', orgId] as const,
  sites: (orgId: string) => ['org', orgId, 'sites'] as const,
  users: (orgId: string) => ['org', orgId, 'users'] as const,
  compare: (orgId: string, range: TimeRange) => ['org', orgId, 'compare', range] as const,
  site: (siteId: string) => ['site', siteId] as const,
  siteSettings: (siteId: string) => ['site', siteId, 'settings'] as const,
  siteConfig: (siteId: string) => ['site', siteId, 'config'] as const,
  live: (siteId: string) => ['site', siteId, 'live'] as const,
  alerts: (siteId: string, status: string) => ['site', siteId, 'alerts', status] as const,
  devices: (siteId: string) => ['site', siteId, 'devices'] as const,
  summary: (siteId: string, range: TimeRange) => ['site', siteId, 'summary', range] as const,
  timeseries: (siteId: string, q: TimeseriesQuery) => ['site', siteId, 'timeseries', q] as const,
  tableStats: (siteId: string, range: TimeRange) => ['site', siteId, 'tableStats', range] as const,
  shiftReport: (siteId: string, date: string) => ['site', siteId, 'shift', date] as const,
  vapidKey: ['push', 'vapid'] as const,
};
