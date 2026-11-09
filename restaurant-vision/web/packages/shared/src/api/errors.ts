export type ApiErrorKind = 'http' | 'network' | 'auth';

/** Error thrown by the API client. `status` is 0 for network failures. */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly body: unknown;
  /** Seconds from a `Retry-After` header (429/503), or null. */
  readonly retryAfterS: number | null;

  constructor(
    message: string,
    opts: { status: number; kind: ApiErrorKind; body?: unknown; retryAfterS?: number | null },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.kind = opts.kind;
    this.body = opts.body;
    this.retryAfterS = opts.retryAfterS ?? null;
  }

  get isNetwork(): boolean {
    return this.kind === 'network';
  }
}

/**
 * `Retry-After` in seconds: delta-seconds or an HTTP date (relative to `nowMs`); null when
 * missing or unparsable.
 */
export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** FastAPI style `{detail: string | [{msg}]}` to a readable message. */
export function detailMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : null))
        .filter(Boolean);
      if (msgs.length) return msgs.join('; ');
    }
  }
  return fallback;
}
