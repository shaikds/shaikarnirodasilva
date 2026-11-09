// Reconnecting WebSocket for `WS /api/v1/ws?token=&site_id=` and the edge's LAN socket
// `/local/ws`. Both send EdgeEvents plus `LiveSnapshotMessage`s (`{type:"live.snapshot"}`: the
// cloud sends one to owners and managers on connect, the edge on connect and every few seconds).
// Exponential backoff with jitter; a fresh URL (token) on every attempt; `WsCloseCode` 4401
// triggers one token refresh; 4403 (no access) and 4400 (bad request) stop reconnecting.
import type { EdgeEvent, LiveSnapshot } from '../contracts';
import { isEdgeEvent, isLiveSnapshotMessage, WS_CLOSE_CODES } from '../contracts';

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** `WsCloseCode` values of the cloud socket (contracts 1.1). */
export const WS_CLOSE_BAD_REQUEST = WS_CLOSE_CODES.badRequest;
export const WS_CLOSE_UNAUTHORIZED = WS_CLOSE_CODES.unauthorized;
export const WS_CLOSE_FORBIDDEN = WS_CLOSE_CODES.forbidden;

export interface BackoffOptions {
  initialMs: number;
  maxMs: number;
  factor: number;
  /** 0..1, fraction of the delay randomized. */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  initialMs: 1000,
  maxMs: 30_000,
  factor: 2,
  jitter: 0.2,
};

/** Delay before reconnect attempt `attempt` (0-based). */
export function computeBackoff(
  attempt: number,
  opts: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const base = Math.min(opts.maxMs, opts.initialMs * opts.factor ** attempt);
  const spread = base * opts.jitter;
  return Math.max(0, Math.round(base - spread + random() * 2 * spread));
}

export interface LiveSocketOptions {
  /** Called before every connection attempt so a refreshed token is used. */
  getUrl: () => string;
  onEvent: (event: EdgeEvent) => void;
  /** Full state (`live.snapshot` message), e.g. from the edge's local socket. */
  onSnapshot?: (snapshot: LiveSnapshot) => void;
  onStatus?: (status: LiveStatus) => void;
  /** Fired on every successful open; `reconnected` is false the first time. */
  onOpen?: (reconnected: boolean) => void;
  /** Refresh the access token after an auth close; resolve false to give up. */
  refreshAuth?: () => Promise<boolean>;
  backoff?: Partial<BackoffOptions>;
  WebSocketImpl?: typeof WebSocket;
}

export class LiveSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private everOpened = false;
  private status: LiveStatus = 'idle';
  private readonly backoff: BackoffOptions;

  constructor(private readonly opts: LiveSocketOptions) {
    this.backoff = { ...DEFAULT_BACKOFF, ...opts.backoff };
  }

  get currentStatus(): LiveStatus {
    return this.status;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (typeof window !== 'undefined') window.addEventListener('online', this.handleOnline);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (typeof window !== 'undefined') window.removeEventListener('online', this.handleOnline);
    this.clearTimer();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000, 'client stop');
      } catch {
        // ignore
      }
    }
    this.setStatus('closed');
  }

  /** Reconnect now (e.g. the browser came back online). */
  reconnectNow(): void {
    if (this.stopped || this.status === 'open' || this.status === 'connecting') return;
    this.clearTimer();
    this.connect();
  }

  private readonly handleOnline = () => this.reconnectNow();

  private setStatus(status: LiveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.opts.onStatus?.(status);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;
    const Impl = this.opts.WebSocketImpl ?? globalThis.WebSocket;
    if (!Impl) {
      this.setStatus('closed');
      return;
    }
    this.setStatus(this.everOpened || this.attempt > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new Impl(this.opts.getUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      this.setStatus('open');
      this.opts.onOpen?.(reconnected);
    };
    ws.onmessage = (msg: MessageEvent) => {
      if (typeof msg.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (isEdgeEvent(parsed)) this.opts.onEvent(parsed);
      else if (isLiveSnapshotMessage(parsed)) this.opts.onSnapshot?.(parsed.snapshot);
    };
    ws.onerror = () => {
      // `close` follows; reconnect is handled there.
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (ev.code === WS_CLOSE_FORBIDDEN || ev.code === WS_CLOSE_BAD_REQUEST) {
        this.setStatus('closed');
        return;
      }
      if (ev.code === WS_CLOSE_UNAUTHORIZED && this.opts.refreshAuth) {
        this.setStatus('reconnecting');
        this.opts
          .refreshAuth()
          .then((ok) => {
            if (this.stopped) return;
            if (ok) this.connect();
            else this.setStatus('closed');
          })
          .catch(() => this.scheduleReconnect());
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = computeBackoff(this.attempt, this.backoff);
    this.attempt += 1;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}
