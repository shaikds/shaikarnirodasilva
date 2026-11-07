import { beforeAll, describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDuration,
  formatElapsed,
  formatNumber,
  formatRelativeTime,
} from '../i18n/format';
import { initI18n } from '../i18n';

// Intl inserts bidi marks and non-breaking spaces; compare on normalized text.
const norm = (s: string) => s.replace(/[\u200e\u200f\u061c]/g, '').replace(/[\u00a0\u202f]/g, ' ');

beforeAll(() => {
  initI18n({ lng: 'he' });
});

describe('formatDuration', () => {
  it('formats minutes in Hebrew and English', () => {
    expect(formatDuration(240, 'he')).toBe('4 דק׳');
    expect(formatDuration(240, 'en')).toBe('4 min');
  });

  it('uses seconds under a minute', () => {
    expect(formatDuration(45, 'he')).toBe('45 שנ׳');
    expect(formatDuration(45, 'en')).toBe('45 s');
    expect(formatDuration(59.6, 'en')).toBe('1 min');
  });

  it('uses hours and minutes past an hour', () => {
    expect(formatDuration(3900, 'he')).toBe('1 שע׳ 5 דק׳');
    expect(formatDuration(3900, 'en')).toBe('1 h 5 min');
    expect(formatDuration(7200, 'en')).toBe('2 h');
    expect(formatDuration(3599, 'en')).toBe('1 h');
  });

  it('never goes negative', () => {
    expect(formatDuration(-10, 'en')).toBe('0 s');
  });
});

describe('formatNumber / formatCurrency', () => {
  it('groups thousands', () => {
    expect(formatNumber(12345, 'he')).toBe('12,345');
    expect(formatNumber(12345.67, 'en', 1)).toBe('12,345.7');
  });

  it('formats ILS, USD and AUD per language', () => {
    expect(norm(formatCurrency(1234, 'ILS', 'he'))).toBe('1,234 ₪');
    expect(norm(formatCurrency(1234, 'ILS', 'en'))).toBe('₪1,234');
    expect(norm(formatCurrency(1234, 'USD', 'en'))).toBe('$1,234');
    expect(norm(formatCurrency(1234, 'AUD', 'en'))).toBe('A$1,234');
    expect(norm(formatCurrency(99.5, 'USD', 'en', 2))).toBe('$99.5');
  });
});

describe('formatRelativeTime', () => {
  const now = 1_800_000_000;
  it('says "now" for very recent times', () => {
    expect(formatRelativeTime(now - 10, 'en', now)).toBe('now');
    expect(formatRelativeTime(now - 10, 'he', now)).toBe('עכשיו');
  });

  it('formats minutes and hours ago', () => {
    expect(formatRelativeTime(now - 240, 'en', now)).toBe('4 minutes ago');
    expect(formatRelativeTime(now - 240, 'he', now)).toBe('לפני 4 דקות');
    expect(formatRelativeTime(now - 7200, 'en', now)).toBe('2 hours ago');
  });
});

describe('formatElapsed', () => {
  it('formats a stopwatch', () => {
    expect(formatElapsed(245)).toBe('4:05');
    expect(formatElapsed(3723)).toBe('1:02:03');
    expect(formatElapsed(-3)).toBe('0:00');
  });
});
