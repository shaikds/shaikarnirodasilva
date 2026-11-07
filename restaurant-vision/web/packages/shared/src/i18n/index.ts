// i18next setup: Hebrew (RTL) is the default, English second. Apps register their own
// namespaces; `<html dir lang>` follows the active language.
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '../contracts';
import { safeGetItem, safeSetItem } from '../lib/storage';
import { sharedResources, type ResourceBundle } from './resources';

export const DEFAULT_LANGUAGE: Locale = 'he';
export const SUPPORTED_LANGUAGES: readonly Locale[] = ['he', 'en'];
export const LANGUAGE_STORAGE_KEY = 'rv-lang';

export const i18n: I18n = i18next.createInstance();

export function isLocale(value: unknown): value is Locale {
  return value === 'he' || value === 'en';
}

export function directionOf(lng: string): 'rtl' | 'ltr' {
  return lng.startsWith('he') ? 'rtl' : 'ltr';
}

/** Sets `<html lang dir>` for `lng`. */
export function applyDocumentLanguage(lng: string): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.lang = lng;
  el.dir = directionOf(lng);
}

export function storedLanguage(): Locale {
  const v = safeGetItem(LANGUAGE_STORAGE_KEY);
  return isLocale(v) ? v : DEFAULT_LANGUAGE;
}

export interface InitI18nOptions {
  /** App resources (language -> namespace -> messages), merged with the shared ones. */
  resources?: Partial<ResourceBundle>;
  /** Namespace looked up first by `t()` without a prefix; falls back to `common`. */
  defaultNS?: string;
  /** Initial language; defaults to the stored choice, then Hebrew. */
  lng?: Locale;
}

/** Initializes the shared i18n instance (safe to call more than once). */
export function initI18n(options: InitI18nOptions = {}): I18n {
  const lng = options.lng ?? storedLanguage();
  const defaultNS = options.defaultNS ?? 'common';
  if (i18n.isInitialized) {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const [ns, messages] of Object.entries(options.resources?.[language] ?? {})) {
        i18n.addResourceBundle(language, ns, messages, true, true);
      }
    }
    i18n.setDefaultNamespace(defaultNS);
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
    else applyDocumentLanguage(lng);
    return i18n;
  }
  const resources: Record<string, Record<string, object>> = {};
  for (const language of SUPPORTED_LANGUAGES) {
    resources[language] = { ...sharedResources[language], ...(options.resources?.[language] ?? {}) };
  }
  i18n.on('languageChanged', applyDocumentLanguage);
  void i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: Object.keys(resources[DEFAULT_LANGUAGE] ?? { common: {} }),
    defaultNS,
    fallbackNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
    react: { useSuspense: false },
  });
  applyDocumentLanguage(i18n.language || lng);
  return i18n;
}

/** Switches the UI language, persists the choice and updates `<html dir lang>`. */
export async function setLanguage(lng: Locale): Promise<void> {
  safeSetItem(LANGUAGE_STORAGE_KEY, lng);
  await i18n.changeLanguage(lng);
}

/** The active language as a contract `Locale`. */
export function currentLanguage(): Locale {
  const l = i18n.resolvedLanguage ?? i18n.language;
  return isLocale(l) ? l : DEFAULT_LANGUAGE;
}

export { useTranslation, Trans } from 'react-i18next';
