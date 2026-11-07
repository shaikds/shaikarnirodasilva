// Vite plugin: serves MSW's `mockServiceWorker.js` in dev and emits it into the build only
// when VITE_MOCK=1 (mock demo builds). Keeps the generated worker out of the repository.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

const require = createRequire(import.meta.url);

function workerSource(): string {
  return readFileSync(require.resolve('msw/mockServiceWorker.js'), 'utf8');
}

export function mswWorkerPlugin(): Plugin {
  let base = '/';
  let mock = false;
  return {
    name: 'rv-msw-worker',
    configResolved(config) {
      base = config.base;
      const env = {
        ...loadEnv(config.mode, config.envDir || config.root, 'VITE_'),
        ...process.env,
      };
      mock = env.VITE_MOCK === '1' || env.VITE_MOCK === 'true';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `${base}mockServiceWorker.js`) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Service-Worker-Allowed', '/');
        res.end(workerSource());
      });
    },
    generateBundle() {
      if (!mock) return;
      this.emitFile({ type: 'asset', fileName: 'mockServiceWorker.js', source: workerSource() });
    },
  };
}
