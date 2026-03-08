/**
 * Input sanitization (Single Responsibility: clean untrusted strings).
 * Zod validates shape; this module cleans content.
 */

/** Strip leading/trailing whitespace and collapse internal whitespace. */
export function trimAndNormalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Escape HTML special characters to prevent XSS when values are
 * ever rendered as HTML (belt-and-suspenders for stored data).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize a display-safe string: trim, normalize whitespace, escape HTML.
 * Use for customer names, notes, descriptions.
 */
export function sanitizeText(value: string): string {
  return escapeHtml(trimAndNormalize(value));
}

/**
 * Sanitize an email: lowercase + trim.
 * Validation (format check) is handled by Zod schemas.
 */
export function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Sanitize a URL: only allow http/https schemes.
 * Returns null if unsafe.
 */
export function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Apply sanitizeText to all string values in a plain object (shallow). */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (typeof val === 'string') {
      result[key] = sanitizeText(val);
    }
  }
  return result as T;
}
