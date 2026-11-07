import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyDocumentLanguage, i18n, initI18n, LANGUAGE_STORAGE_KEY, setLanguage, storedLanguage } from '../i18n';
import { commonEn, commonHe } from '../i18n/resources';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

/** Flattened keys, with Hebrew-only plural forms (`_two`, `_many`) folded into `_other`. */
function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const comparable = (keys: string[]) =>
  [...new Set(keys.filter((k) => !/_(two|many)$/.test(k)))].sort();

describe('i18n', () => {
  beforeEach(async () => {
    initI18n({ lng: 'he' });
    await i18n.changeLanguage('he');
  });

  it('defaults to Hebrew, right-to-left', () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    expect(storedLanguage()).toBe('he');
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('switches <html dir lang> when the language changes', async () => {
    await act(() => setLanguage('en'));
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    await act(() => setLanguage('he'));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
  });

  it('the language switcher toggles direction', async () => {
    render(<LanguageSwitcher />);
    const button = screen.getByRole('button', { name: /English/ });
    await act(async () => button.click());
    expect(document.documentElement.dir).toBe('ltr');
    await act(async () => screen.getByRole('button', { name: /עברית/ }).click());
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('applyDocumentLanguage maps languages to directions', () => {
    applyDocumentLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
    applyDocumentLanguage('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('survives a throwing localStorage', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(storedLanguage()).toBe('he');
      await act(() => setLanguage('en'));
      expect(document.documentElement.dir).toBe('ltr');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('Hebrew and English common strings have the same keys', () => {
    expect(comparable(keysOf(commonHe))).toEqual(comparable(keysOf(commonEn)));
  });
});
