// fetch wrapper: base URL from VITE_API_URL, bearer JWT, refresh-once-and-retry on 401,
// FastAPI error bodies, and reachability reporting (the waiter app's offline banner).
import type { TokenPair } from '../contracts';
import { API_PREFIX, rvEnv } from '../lib/env';
import { ApiError, detailMessage, parseRetryAfter } from './errors';

export interface AuthAdapter {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(pair: TokenPair): void;
  clear(): void;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Send the user's bearer token (default true). */
  auth?: boolean;
  /** Explicit bearer token (edge device token); disables refresh. */
  token?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiClientConfig {
  /** Cloud origin; defaults to `VITE_API_URL`, then the page origin. */
  baseUrl?: string;
  /** Path prefix of every endpoint (default `/api/v1`; the edge's LAN API uses `''`). */
  prefix?: string;
  auth?: AuthAdapter;
  fetch?: typeof fetch;
  /** Called after every request: true if the cloud answered, false if it was unreachable. */
  onReachability?: (reachable: boolean) => void;
  /** Called once the session is gone (refresh failed or still 401 after refresh). */
  onAuthLost?: () => void;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  /** Absolute URL for an API path (no query string). */
  url(path: string): string;
  /** `ws(s)://.../api/v1/ws?token=&site_id=` for the current access token. */
  wsUrl(params: Record<string, string>): string;
  /** Refreshes the access token (deduplicated). Resolves false when the session is gone. */
  refresh(): Promise<boolean>;
  readonly auth: AuthAdapter | undefined;
}

function pageOrigin(): string {
  return typeof window !== 'undefined' && window.location
    ? window.location.origin
    : 'http://localhost';
}

const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const base = (config.baseUrl ?? rvEnv.apiUrl).replace(/\/+$/, '');
  const auth = config.auth;
  const doFetch: typeof fetch = (...args) => (config.fetch ?? globalThis.fetch)(...args);
  let refreshing: Promise<boolean> | null = null;

  const prefix = config.prefix ?? API_PREFIX;
  const url = (path: string): string => `${base || pageOrigin()}${prefix}${path}`;

  function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const u = new URL(url(path));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  async function send(
    path: string,
    opts: RequestOptions,
    bearer: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    let res: Response;
    try {
      res = await doFetch(buildUrl(path, opts.query), {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      config.onReachability?.(false);
      throw new ApiError('Network error', { status: 0, kind: 'network', body: err });
    }
    config.onReachability?.(!UNREACHABLE_STATUSES.has(res.status));
    return res;
  }

  async function doRefresh(): Promise<boolean> {
    const refreshToken = auth?.getRefreshToken();
    if (!auth || !refreshToken) return false;
    // A network error propagates and keeps the session; only a rejected refresh ends it.
    const res = await send(
      '/auth/refresh',
      { method: 'POST', body: { refresh_token: refreshToken } },
      null,
    );
    if (!res.ok) {
      auth.clear();
      config.onAuthLost?.();
      return false;
    }
    auth.setTokens((await res.json()) as TokenPair);
    return true;
  }

  function refresh(): Promise<boolean> {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const useAuth = opts.auth !== false && !opts.token;
    const bearer = opts.token ?? (useAuth ? (auth?.getAccessToken() ?? null) : null);
    let res = await send(path, opts, bearer);

    if (res.status === 401 && useAuth && auth?.getRefreshToken()) {
      const refreshed = await refresh();
      if (refreshed) {
        res = await send(path, opts, auth.getAccessToken());
        if (res.status === 401) {
          // Refreshed token rejected too: the session is not usable. Do not loop.
          auth.clear();
          config.onAuthLost?.();
        }
      }
    }

    if (!res.ok) {
      const body = await parse<unknown>(res).catch(() => undefined);
      throw new ApiError(detailMessage(body, `HTTP ${res.status}`), {
        status: res.status,
        kind: res.status === 401 ? 'auth' : 'http',
        body,
        retryAfterS: parseRetryAfter(res.headers?.get('Retry-After') ?? null),
      });
    }
    return parse<T>(res);
  }

  function wsUrl(params: Record<string, string>): string {
    const u = new URL(url('/ws'));
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  return { request, url, wsUrl, refresh, auth };
}
