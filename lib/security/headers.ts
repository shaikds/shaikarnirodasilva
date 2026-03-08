import { NextResponse } from 'next/server';

/**
 * Security headers (Single Responsibility: produce hardened response headers).
 * Applied to every API response.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
};

/** Apply security headers to an existing NextResponse. */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Wrap a NextResponse factory with security headers. */
export function secureJson(
  body: unknown,
  init?: Parameters<typeof NextResponse.json>[1]
): NextResponse {
  const res = NextResponse.json(body, init);
  return applySecurityHeaders(res);
}

/** Rate-limit exceeded response (429). */
export function rateLimitExceeded(): NextResponse {
  const res = NextResponse.json(
    { error: 'Too many requests — please wait before trying again' },
    {
      status: 429,
      headers: { 'Retry-After': '60' },
    }
  );
  return applySecurityHeaders(res);
}
