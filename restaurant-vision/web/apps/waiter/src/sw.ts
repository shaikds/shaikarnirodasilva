/// <reference lib="webworker" />
// Waiter PWA service worker: precaches the app shell, shows a notification for every Web Push
// (table label + alert kind, in the user's language) and focuses the app on click.
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { buildNotification, normalizePayload } from './lib/notification';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
);

void self.skipWaiting();
clientsClaim();

// ---------------------------------------------------------------- language (set by the page)
const SETTINGS_CACHE = 'rv-sw-settings';
const LANG_KEY = '/__rv/lang';
let lang: 'he' | 'en' | null = null;

async function currentLang(): Promise<'he' | 'en'> {
  if (lang) return lang;
  try {
    const res = await (await caches.open(SETTINGS_CACHE)).match(LANG_KEY);
    const stored = res ? await res.text() : null;
    lang = stored === 'en' ? 'en' : 'he';
  } catch {
    lang = 'he';
  }
  return lang;
}

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; lang?: string } | null;
  if (data?.type !== 'rv:lang') return;
  lang = data.lang === 'en' ? 'en' : 'he';
  event.waitUntil(caches.open(SETTINGS_CACHE).then((c) => c.put(LANG_KEY, new Response(lang))));
});

// ---------------------------------------------------------------- push
self.addEventListener('push', (event) => {
  let data: unknown = null;
  try {
    data = event.data?.json();
  } catch {
    data = null;
  }
  event.waitUntil(
    currentLang().then((l) => {
      const { title, options } = buildNotification(
        normalizePayload(data),
        l,
        `${self.registration.scope}icon.svg`,
      );
      return self.registration.showNotification(title, options);
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((c) => c.url.startsWith(target));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});
