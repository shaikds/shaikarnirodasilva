/**
 * In-memory rate limiter (Single Responsibility: throttle requests by IP).
 * For multi-server production environments, replace the store with Redis.
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window in milliseconds */
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  limit: 60,
  windowMs: 60_000, // 1 minute
};

const CHAT_OPTIONS: RateLimitOptions = {
  limit: 20,
  windowMs: 60_000, // chat is expensive — tighter limit
};

// Separate stores per route group
const stores: Map<string, Map<string, TokenBucket>> = new Map();

function getStore(name: string): Map<string, TokenBucket> {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name)!;
}

/**
 * Returns `true` if the request is allowed.
 * Side-effect: records the attempt and removes expired entries.
 */
export function isAllowed(ip: string, storeName = 'default', opts = DEFAULT_OPTIONS): boolean {
  const store = getStore(storeName);
  const now = Date.now();

  let bucket = store.get(ip);

  if (!bucket || now - bucket.lastRefill >= opts.windowMs) {
    // Fresh window
    bucket = { tokens: opts.limit - 1, lastRefill: now };
    store.set(ip, bucket);
    return true;
  }

  if (bucket.tokens <= 0) return false;

  bucket.tokens -= 1;
  return true;
}

export function chatRateLimit(ip: string): boolean {
  return isAllowed(ip, 'chat', CHAT_OPTIONS);
}

export function defaultRateLimit(ip: string): boolean {
  return isAllowed(ip, 'default', DEFAULT_OPTIONS);
}

/** Extract the real client IP from Next.js headers. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Purge stores — use only in tests. */
export function purgeRateLimitStores(): void {
  stores.clear();
}
