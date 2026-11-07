// Typed client for the edge LAN API (`/local/*`, rv_edge/runtime/local_api.py).
// Open endpoints (health, state, setup status, alert ack, first PIN) need nothing; setup
// endpoints send the PIN as `X-Setup-Pin`. A 401 on a setup call means the stored PIN is wrong
// or was reset, a 429 means this client is locked out for a while: both are reported through
// `onPinProblem` so the wizard can send the installer back to the PIN step.
import {
  ApiError,
  createApiClient,
  detailMessage,
  type AlertView,
  type ApiClient,
  type CoverageReport,
  type HealthStatus,
  type LiveSnapshot,
  type SiteConfig,
} from '@rv/shared';
import type {
  CalibrateIn,
  CalibrateOut,
  CameraIn,
  CameraOut,
  CameraUpdate,
  DiscoveryOut,
  PairIn,
  PairOut,
  SetupStatus,
  SuggestTablesIn,
  SuggestTablesOut,
} from './types';

export const PIN_HEADER = 'X-Setup-Pin';

export type PinProblem = 'invalid' | 'locked';

export interface LocalApiOptions {
  /** Edge origin; defaults to the page origin (the edge serves this app). */
  baseUrl?: string;
  /** Current setup PIN (read on every request). */
  getPin: () => string | null;
  /** A setup call was rejected: wrong/missing PIN (401) or too many wrong PINs (429). */
  onPinProblem?: (problem: PinProblem) => void;
  fetch?: typeof fetch;
}

const enc = encodeURIComponent;

export function pinProblemOf(error: unknown): PinProblem | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401) return 'invalid';
  if (error.status === 429) return 'locked';
  return null;
}

export function createLocalApi(options: LocalApiOptions) {
  const client: ApiClient = createApiClient({
    baseUrl: options.baseUrl,
    prefix: '',
    fetch: options.fetch,
  });
  const doFetch: typeof fetch = (...args) => (options.fetch ?? globalThis.fetch)(...args);

  const open = <T>(path: string, init: Parameters<ApiClient['request']>[1] = {}) =>
    client.request<T>(path, { ...init, auth: false });

  async function setup<T>(
    path: string,
    init: Parameters<ApiClient['request']>[1] = {},
  ): Promise<T> {
    const pin = options.getPin();
    try {
      return await client.request<T>(path, {
        ...init,
        auth: false,
        headers: { ...init?.headers, ...(pin ? { [PIN_HEADER]: pin } : {}) },
      });
    } catch (err) {
      const problem = pinProblemOf(err);
      if (problem) options.onPinProblem?.(problem);
      throw err;
    }
  }

  /**
   * The blurred setup snapshot as a Blob (kept in memory only: the caller turns it into an
   * object URL and revokes it). `img src` cannot send the PIN header, hence fetch.
   */
  async function snapshot(cameraId: string, signal?: AbortSignal): Promise<Blob> {
    const pin = options.getPin();
    const url = new URL(client.url(`/local/cameras/${enc(cameraId)}/snapshot.jpg`));
    url.searchParams.set('t', String(Date.now())); // cache-busting
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        headers: pin ? { [PIN_HEADER]: pin } : {},
        cache: 'no-store',
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new ApiError('Network error', { status: 0, kind: 'network', body: err });
    }
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const error = new ApiError(detailMessage(body, `HTTP ${res.status}`), {
        status: res.status,
        kind: res.status === 401 ? 'auth' : 'http',
        body,
      });
      const problem = pinProblemOf(error);
      if (problem) options.onPinProblem?.(problem);
      throw error;
    }
    return res.blob();
  }

  return {
    client,
    // ------------------------------------------------------------- open (LAN, no PIN)
    health: (signal?: AbortSignal) => open<HealthStatus>('/local/health', { signal }),
    state: (signal?: AbortSignal) => open<LiveSnapshot>('/local/state', { signal }),
    setupStatus: (signal?: AbortSignal) => open<SetupStatus>('/local/setup/status', { signal }),
    ackAlert: (alertId: string) =>
      open<AlertView>(`/local/alerts/${enc(alertId)}/ack`, { method: 'POST' }),
    createPin: (pin: string) =>
      open<{ pin_set: boolean }>('/local/setup-pin', { method: 'POST', body: { pin } }),
    /** `ws(s)://<edge>/local/ws` */
    wsUrl: () => {
      const u = new URL(client.url('/local/ws'));
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.toString();
    },

    // ------------------------------------------------------------- setup (X-Setup-Pin)
    /** Checks a PIN without storing it: any 2xx from a protected endpoint means it is right. */
    // Not reported through onPinProblem: the PIN step shows the result inline.
    verifyPin: async (pin: string): Promise<void> => {
      await client.request<CameraOut[]>('/local/cameras', {
        auth: false,
        headers: { [PIN_HEADER]: pin },
      });
    },
    listCameras: (signal?: AbortSignal) => setup<CameraOut[]>('/local/cameras', { signal }),
    addCamera: (body: CameraIn) =>
      setup<CameraOut>('/local/cameras', { method: 'POST', body }),
    updateCamera: (cameraId: string, body: CameraUpdate) =>
      setup<CameraOut>(`/local/cameras/${enc(cameraId)}`, { method: 'PUT', body }),
    deleteCamera: (cameraId: string) =>
      setup<void>(`/local/cameras/${enc(cameraId)}`, { method: 'DELETE' }),
    discoverCameras: () => setup<DiscoveryOut>('/local/cameras/discover', { method: 'POST' }),
    snapshot,
    getConfig: (signal?: AbortSignal) => setup<SiteConfig>('/local/config', { signal }),
    putConfig: (config: SiteConfig) =>
      setup<SiteConfig>('/local/config', { method: 'PUT', body: config }),
    coverage: (signal?: AbortSignal) => setup<CoverageReport>('/local/coverage', { signal }),
    calibrateUniform: (body: CalibrateIn) =>
      setup<CalibrateOut>('/local/uniform/calibrate', { method: 'POST', body }),
    pair: (body: PairIn) => setup<PairOut>('/local/pair', { method: 'POST', body }),
    suggestTables: (cameraId: string, body: SuggestTablesIn = {}) =>
      setup<SuggestTablesOut>(`/local/cameras/${enc(cameraId)}/suggest-tables`, {
        method: 'POST',
        body,
      }),
  };
}

export type LocalApi = ReturnType<typeof createLocalApi>;
