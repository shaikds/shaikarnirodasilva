import { describe, expect, it, vi } from 'vitest';
import { createApiClient, type AuthAdapter } from '../api/client';
import { ApiError } from '../api/errors';
import type { TokenPair } from '../contracts';

function memoryAuth(initial: { access: string | null; refresh: string | null }) {
  const state = { ...initial, cleared: false };
  const auth: AuthAdapter = {
    getAccessToken: () => state.access,
    getRefreshToken: () => state.refresh,
    setTokens: (p: TokenPair) => {
      state.access = p.access_token;
      state.refresh = p.refresh_token;
    },
    clear: () => {
      state.access = null;
      state.refresh = null;
      state.cleared = true;
    },
  };
  return { auth, state };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const pair = (n: number): TokenPair => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: 'bearer',
  expires_in: 900,
});

/** Fake backend: `/me` accepts only `validAccess`; refresh answers with `refreshResult`. */
function backend(opts: { validAccess: string; refreshResult: () => Response }) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get('Authorization') });
    if (url.endsWith('/api/v1/auth/refresh')) return opts.refreshResult();
    if (headers.get('Authorization') === `Bearer ${opts.validAccess}`)
      return json(200, { ok: true });
    return json(401, { detail: 'expired' });
  });
  return { fetchImpl, calls };
}

describe('API client', () => {
  it('builds URLs from the base URL and API prefix, with query params', async () => {
    const { auth } = memoryAuth({ access: 'a', refresh: 'r' });
    const fetchImpl = vi.fn(async () => json(200, []));
    const client = createApiClient({ baseUrl: 'https://cloud.example/', auth, fetch: fetchImpl });
    await client.request('/sites/s1/alerts', {
      query: { status: 'open', from: 10, to: undefined },
    });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(
      'https://cloud.example/api/v1/sites/s1/alerts?status=open&from=10',
    );
    expect(client.wsUrl({ token: 't', site_id: 's1' })).toBe(
      'wss://cloud.example/api/v1/ws?token=t&site_id=s1',
    );
  });

  it('supports another prefix, e.g. the edge LAN API', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const client = createApiClient({
      baseUrl: 'http://rv-edge.local:8787',
      prefix: '',
      fetch: fetchImpl,
    });
    await client.request('/local/state', { auth: false });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(
      'http://rv-edge.local:8787/local/state',
    );
    expect(client.wsUrl({})).toBe('ws://rv-edge.local:8787/ws');
  });

  it('sends the bearer token', async () => {
    const { auth } = memoryAuth({ access: 'access-1', refresh: 'refresh-1' });
    const { fetchImpl, calls } = backend({
      validAccess: 'access-1',
      refreshResult: () => json(200, pair(2)),
    });
    const client = createApiClient({ baseUrl: 'https://x', auth, fetch: fetchImpl });
    await expect(client.request('/me')).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.auth).toBe('Bearer access-1');
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    const { auth, state } = memoryAuth({ access: 'access-1', refresh: 'refresh-1' });
    const { fetchImpl, calls } = backend({
      validAccess: 'access-2',
      refreshResult: () => json(200, pair(2)),
    });
    const client = createApiClient({ baseUrl: 'https://x', auth, fetch: fetchImpl });
    await expect(client.request('/me')).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url.replace('https://x/api/v1', ''))).toEqual([
      '/me',
      '/auth/refresh',
      '/me',
    ]);
    expect(calls[2]!.auth).toBe('Bearer access-2');
    expect(state.access).toBe('access-2');
    expect(state.refresh).toBe('refresh-2');
  });

  it('shares one refresh between concurrent 401s', async () => {
    const { auth } = memoryAuth({ access: 'access-1', refresh: 'refresh-1' });
    const { fetchImpl, calls } = backend({
      validAccess: 'access-2',
      refreshResult: () => json(200, pair(2)),
    });
    const client = createApiClient({ baseUrl: 'https://x', auth, fetch: fetchImpl });
    await Promise.all([client.request('/me'), client.request('/me'), client.request('/me')]);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('does not retry again when the retried request is still 401', async () => {
    const { auth, state } = memoryAuth({ access: 'access-1', refresh: 'refresh-1' });
    const onAuthLost = vi.fn();
    const { fetchImpl, calls } = backend({
      validAccess: 'never',
      refreshResult: () => json(200, pair(2)),
    });
    const client = createApiClient({ baseUrl: 'https://x', auth, fetch: fetchImpl, onAuthLost });
    await expect(client.request('/me')).rejects.toMatchObject({ status: 401, kind: 'auth' });
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(state.cleared).toBe(true);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh is rejected', async () => {
    const { auth, state } = memoryAuth({ access: 'access-1', refresh: 'refresh-1' });
    const onAuthLost = vi.fn();
    const { fetchImpl, calls } = backend({
      validAccess: 'x',
      refreshResult: () => json(401, { detail: 'bad' }),
    });
    const client = createApiClient({ baseUrl: 'https://x', auth, fetch: fetchImpl, onAuthLost });
    const err = await client.request('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(calls).toHaveLength(2);
    expect(state.cleared).toBe(true);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails on the network', async () => {
    const { auth, state } = memoryAuth({ access: 'access-1', refresh: 'refresh-1' });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) throw new TypeError('Failed to fetch');
      return json(401, { detail: 'expired' });
    });
    const reach = vi.fn();
    const client = createApiClient({
      baseUrl: 'https://x',
      auth,
      fetch: fetchImpl,
      onReachability: reach,
    });
    await expect(client.request('/me')).rejects.toMatchObject({ kind: 'network', status: 0 });
    expect(state.cleared).toBe(false);
    expect(reach).toHaveBeenLastCalledWith(false);
  });

  it('does not refresh for unauthenticated calls or without a refresh token', async () => {
    const { auth } = memoryAuth({ access: null, refresh: null });
    const fetchImpl = vi.fn(async () => json(401, { detail: 'Invalid email or password' }));
    const client = createApiClient({ baseUrl: 'https://x', auth, fetch: fetchImpl });
    await expect(
      client.request('/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toThrow('Invalid email or password');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204 and reports reachability', async () => {
    const reach = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: 'https://x',
      fetch: fetchImpl,
      onReachability: reach,
    });
    await expect(
      client.request('/push/subscriptions/1', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
    expect(reach).toHaveBeenCalledWith(true);
  });
});
