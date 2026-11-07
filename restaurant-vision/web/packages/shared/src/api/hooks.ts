// React Query hooks over the typed endpoints.
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useAuthStore } from '../auth/store';
import type {
  AlertView,
  LiveSnapshot,
  LoginRequest,
  SignupRequest,
  SiteCreate,
  SiteSettings,
  SiteSettingsPatch,
  SiteSummary,
  UserCreate,
  UserUpdate,
} from '../contracts';
import type { AlertStatusFilter, TimeRange, TimeseriesQuery } from './endpoints';
import { useApi } from './provider';
import { queryKeys } from './queryKeys';

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

// ------------------------------------------------------------------ auth

/** `GET /me`, only while signed in. */
export function useMe() {
  const api = useApi();
  const signedIn = useAuthStore((s) => s.refreshToken !== null);
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api.me(signal),
    enabled: signedIn,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const api = useApi();
  const qc = useQueryClient();
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: (body: LoginRequest) => api.login(body),
    onSuccess: async (pair) => {
      qc.clear();
      setTokens(pair);
    },
  });
}

export function useSignup() {
  const api = useApi();
  const qc = useQueryClient();
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: (body: SignupRequest) => api.signup(body),
    onSuccess: (pair) => {
      qc.clear();
      setTokens(pair);
    },
  });
}

/** Signs out locally and drops every cached query. */
export function useLogout() {
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  return () => {
    logout();
    qc.clear();
  };
}

// ------------------------------------------------------------------ org and sites

export function useOrg(orgId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.org(orgId ?? ''),
    queryFn: ({ signal }) => api.getOrg(orgId!, signal),
    enabled: !!orgId,
  });
}

export function useSites(orgId: string | undefined, opts: Opts<SiteSummary[]> = {}) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.sites(orgId ?? ''),
    queryFn: ({ signal }) => api.listSites(orgId!, signal),
    enabled: !!orgId,
    ...opts,
  });
}

export function useCreateSite(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteCreate) => api.createSite(orgId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sites(orgId) });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useSiteSettings(siteId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.siteSettings(siteId ?? ''),
    queryFn: ({ signal }) => api.getSite(siteId!, signal),
    enabled: !!siteId,
  });
}

export function useUpdateSite(siteId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SiteSettingsPatch) => api.updateSite(siteId, patch),
    onSuccess: (site: SiteSettings) => {
      qc.setQueryData(queryKeys.siteSettings(siteId), site);
      void qc.invalidateQueries({ queryKey: queryKeys.siteConfig(siteId) });
      void qc.invalidateQueries({ queryKey: ['org'] });
    },
  });
}

export function useSiteConfig(siteId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.siteConfig(siteId ?? ''),
    queryFn: ({ signal }) => api.getSiteConfig(siteId!, signal),
    enabled: !!siteId,
  });
}

// ------------------------------------------------------------------ users

export function useUsers(orgId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.users(orgId ?? ''),
    queryFn: ({ signal }) => api.listUsers(orgId!, signal),
    enabled: !!orgId,
  });
}

export function useCreateUser(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreate) => api.createUser(orgId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users(orgId) }),
  });
}

export function useUpdateUser(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UserUpdate }) =>
      api.updateUser(orgId, userId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users(orgId) }),
  });
}

export function useDeleteUser(orgId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.deleteUser(orgId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users(orgId) }),
  });
}

// ------------------------------------------------------------------ devices

export function useDevices(siteId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.devices(siteId ?? ''),
    queryFn: ({ signal }) => api.listDevices(siteId!, signal),
    enabled: !!siteId,
    refetchInterval: 30_000,
  });
}

export function useCreatePairingCode(siteId: string) {
  const api = useApi();
  return useMutation({ mutationFn: () => api.createPairingCode(siteId) });
}

// ------------------------------------------------------------------ alerts

export function useAlerts(siteId: string | undefined, status: AlertStatusFilter = 'open') {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.alerts(siteId ?? '', status),
    queryFn: ({ signal }) => api.listAlerts(siteId!, { status }, signal),
    enabled: !!siteId,
  });
}

/** Marks an alert as acknowledged in the cached live snapshot (anonymous: time + channel). */
export function applyAckToSnapshot(snapshot: LiveSnapshot, alert: AlertView): LiveSnapshot {
  return {
    ...snapshot,
    open_alerts: snapshot.open_alerts.map((a) => (a.alert_id === alert.alert_id ? alert : a)),
  };
}

/** `POST /alerts/{id}/ack` with an optimistic update of the site's live snapshot. */
export function useAckAlert(siteId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = queryKeys.live(siteId);
  return useMutation({
    mutationFn: (alertId: string) => api.ackAlert(alertId),
    onMutate: async (alertId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<LiveSnapshot>(key);
      if (previous) {
        const now = Date.now() / 1000;
        qc.setQueryData<LiveSnapshot>(key, {
          ...previous,
          open_alerts: previous.open_alerts.map((a) =>
            a.alert_id === alertId && a.status === 'open'
              ? { ...a, status: 'acknowledged', acked_at: now, ack_via: 'cloud' }
              : a,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (alert) => {
      const current = qc.getQueryData<LiveSnapshot>(key);
      if (current) qc.setQueryData(key, applyAckToSnapshot(current, alert));
      void qc.invalidateQueries({ queryKey: ['site', siteId, 'alerts'] });
    },
  });
}

// ------------------------------------------------------------------ metrics and reports

export function useMetricsSummary(siteId: string | undefined, range: TimeRange) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.summary(siteId ?? '', range),
    queryFn: ({ signal }) => api.getMetricsSummary(siteId!, range, signal),
    enabled: !!siteId,
    placeholderData: keepPreviousData,
  });
}

export function useTimeseries(siteId: string | undefined, q: TimeseriesQuery) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.timeseries(siteId ?? '', q),
    queryFn: ({ signal }) => api.getTimeseries(siteId!, q, signal),
    enabled: !!siteId,
    placeholderData: keepPreviousData,
  });
}

export function useTableStats(siteId: string | undefined, range: TimeRange) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.tableStats(siteId ?? '', range),
    queryFn: ({ signal }) => api.getTableStats(siteId!, range, signal),
    enabled: !!siteId,
    placeholderData: keepPreviousData,
  });
}

export function useShiftReport(siteId: string | undefined, date: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.shiftReport(siteId ?? '', date),
    queryFn: ({ signal }) => api.getShiftReport(siteId!, date, signal),
    enabled: !!siteId && /^\d{4}-\d{2}-\d{2}$/.test(date),
    placeholderData: keepPreviousData,
  });
}

export function useBranchComparison(orgId: string | undefined, range: TimeRange, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.compare(orgId ?? '', range),
    queryFn: ({ signal }) => api.compareBranches(orgId!, range, signal),
    enabled: !!orgId && enabled,
    placeholderData: keepPreviousData,
  });
}

// ------------------------------------------------------------------ push

export function useVapidPublicKey(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.vapidKey,
    queryFn: ({ signal }) => api.getVapidPublicKey(signal),
    enabled,
    staleTime: Infinity,
  });
}
