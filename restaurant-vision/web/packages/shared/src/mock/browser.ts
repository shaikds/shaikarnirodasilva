// Starts the MSW service worker and the live simulator (VITE_MOCK=1). Imported dynamically so
// production builds without VITE_MOCK never include MSW.
import { setupWorker } from 'msw/browser';
import { safeGetItem, safeSetItem } from '../lib/storage';
import { MockDb } from './db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demo';
import { createHandlers } from './handlers';

const DB_KEY = 'rv-mock-db';

export interface StartMockOptions {
  /** Base URL the app is served from (Vite `import.meta.env.BASE_URL`). */
  baseUrl?: string;
  /** Simulator step interval in ms (default 2000). */
  tickMs?: number;
}

let started: Promise<MockDb> | null = null;

export function startMockWorker(options: StartMockOptions = {}): Promise<MockDb> {
  if (!started) {
    started = (async () => {
      const db = new MockDb({
        persist: { load: () => safeGetItem(DB_KEY), save: (d) => void safeSetItem(DB_KEY, d) },
      });
      const worker = setupWorker(...createHandlers(db));
      const base = (options.baseUrl ?? '/').replace(/\/?$/, '/');
      await worker.start({
        serviceWorker: { url: `${base}mockServiceWorker.js` },
        onUnhandledRequest: 'bypass',
        quiet: true,
      });
      db.startSimulation(options.tickMs ?? 2000);
      console.info(
        `[rv] Mock backend active (VITE_MOCK=1). Demo logins: ${DEMO_ACCOUNTS.map((a) => a.email).join(', ')} / ${DEMO_PASSWORD}`,
      );
      return db;
    })();
  }
  return started;
}
