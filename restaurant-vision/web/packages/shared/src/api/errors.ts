export type ApiErrorKind = 'http' | 'network' | 'auth';

/** Error thrown by the API client. `status` is 0 for network failures. */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly body: unknown;

  constructor(message: string, opts: { status: number; kind: ApiErrorKind; body?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.kind = opts.kind;
    this.body = opts.body;
  }

  get isNetwork(): boolean {
    return this.kind === 'network';
  }
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
