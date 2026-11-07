// Registers the PWA service worker (production, non-mock) and keeps it and the web app
// manifest in the UI language.
import { i18n } from '@rv/shared';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
  });
}

function syncLanguage(lng: string): void {
  const lang = lng === 'en' ? 'en' : 'he';
  const link = document.getElementById('rv-manifest') as HTMLLinkElement | null;
  if (link) link.href = `${import.meta.env.BASE_URL}manifest.${lang}.webmanifest`;
  document.title = i18n.t('waiter:app.title');
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'rv:lang', lang });
  } catch {
    // no controller yet
  }
}

/** Follows language changes (manifest link, title, SW notification language). */
export function installLanguageSync(): void {
  syncLanguage(i18n.language);
  i18n.on('languageChanged', syncLanguage);
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => syncLanguage(i18n.language));
}
