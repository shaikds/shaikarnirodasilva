// Turns edge API errors into something an installer can act on. The edge returns FastAPI
// shapes: `{detail: "message"}` or, for invalid bodies, `{detail: [{loc, msg, type}]}` (it never
// echoes the input back, so no credentials can appear here).
import { ApiError } from '@rv/shared';

export interface ServerProblem {
  /** Readable location, e.g. `zones › 3 › polygon`, or null. */
  where: string | null;
  message: string;
}

const PREFIXES = [/^Value error,\s*/i, /^Assertion failed,\s*/i, /^invalid site config:\s*/i];

function cleanMessage(msg: string): string {
  let m = msg.trim();
  for (const p of PREFIXES) m = m.replace(p, '');
  return m;
}

/** Splits `a; b; c` style pydantic messages into separate lines. */
function splitMessages(msg: string): string[] {
  return cleanMessage(msg)
    .split(/;\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serverProblems(error: unknown): ServerProblem[] {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { detail?: unknown } | undefined;
  const detail = body && typeof body === 'object' ? body.detail : undefined;
  if (Array.isArray(detail)) {
    return detail.flatMap((d) => {
      const item = (d ?? {}) as { loc?: unknown; msg?: unknown };
      const loc = Array.isArray(item.loc)
        ? item.loc.filter((p) => p !== 'body').map(String).join(' › ')
        : null;
      const msg = typeof item.msg === 'string' ? item.msg : String(item.msg ?? '');
      return splitMessages(msg).map((m) => ({ where: loc || null, message: m }));
    });
  }
  if (typeof detail === 'string') return splitMessages(detail).map((m) => ({ where: null, message: m }));
  return [];
}

export type ErrorKind = 'network' | 'pin' | 'locked' | 'notFound' | 'conflict' | 'invalid' | 'server';

export function errorKind(error: unknown): ErrorKind {
  if (!(error instanceof ApiError)) return 'server';
  if (error.status === 0) return 'network';
  if (error.status === 401) return 'pin';
  if (error.status === 429) return 'locked';
  if (error.status === 404) return 'notFound';
  if (error.status === 409) return 'conflict';
  if (error.status === 422 || error.status === 400) return 'invalid';
  return 'server';
}

export const isStatus = (error: unknown, status: number): boolean =>
  error instanceof ApiError && error.status === status;
