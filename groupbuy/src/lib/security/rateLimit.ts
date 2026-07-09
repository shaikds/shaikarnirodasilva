/**
 * In-memory sliding-window rate limiter. Good for a single-instance MVP;
 * swap for a Redis-backed limiter (same signature) before scaling out.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}
