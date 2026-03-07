'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { he } from './he';
import { en } from './en';
import type { Translations } from './he';

type Language = 'he' | 'en';

interface I18nContextValue {
  t: Translations;
  lang: Language;
  toggle: () => void;
}

const I18nContext = createContext<I18nContextValue>({
  t: he,
  lang: 'he',
  toggle: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('he');

  const toggle = () => setLang(l => (l === 'he' ? 'en' : 'he'));

  // Sync dir/lang on the root <html> element
  useEffect(() => {
    const t = lang === 'he' ? he : en;
    document.documentElement.dir = t.dir;
    document.documentElement.lang = t.lang;
  }, [lang]);

  const t = lang === 'he' ? he : en;

  return (
    <I18nContext.Provider value={{ t, lang, toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Use inside any Client Component to access translations and language toggle. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
