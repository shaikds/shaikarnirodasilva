// Build-time configuration (Vite `import.meta.env`). Every value has a safe default so the
// package also works in tests and in the edge-ui.

interface RvEnv {
  /** Cloud origin, e.g. `https://cloud.example.com`. Empty = same origin (dev proxy). */
  apiUrl: string;
  /** `VITE_MOCK=1`: MSW mock backend + fake live stream, no server needed. */
  mock: boolean;
}

function readEnv(): RvEnv {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> })
    .env;
  const apiUrl = typeof env?.VITE_API_URL === 'string' ? env.VITE_API_URL : '';
  const mock = env?.VITE_MOCK === '1' || env?.VITE_MOCK === 'true' || env?.VITE_MOCK === true;
  return { apiUrl: apiUrl.replace(/\/+$/, ''), mock };
}

export const rvEnv: RvEnv = readEnv();

/** Path prefix of every cloud REST endpoint. */
export const API_PREFIX = '/api/v1';
