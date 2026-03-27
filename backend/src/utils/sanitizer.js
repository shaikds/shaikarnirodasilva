/**
 * Input sanitization utilities.
 * Strips dangerous characters and normalizes input to prevent XSS and injection.
 */

const HTML_ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

const HTML_ENTITY_REGEX = /[&<>"'/]/g;

export function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(HTML_ENTITY_REGEX, (char) => HTML_ENTITY_MAP[char]);
}

export function stripHtmlTags(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

export function trimAndCollapse(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/\s+/g, ' ');
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return trimAndCollapse(stripHtmlTags(str));
}

export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
}

export default { escapeHtml, stripHtmlTags, trimAndCollapse, sanitizeString, sanitizeObject };
