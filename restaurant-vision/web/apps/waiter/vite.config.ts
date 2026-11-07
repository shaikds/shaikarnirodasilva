/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { mswWorkerPlugin } from '@rv/shared/vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000';
  return {
    plugins: [
      react(),
      mswWorkerPlugin(),
      VitePWA({
        // Custom service worker (src/sw.ts): precache + Web Push + notification click.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        // Registered in src/lib/serviceWorker.ts (skipped in mock mode, where MSW owns the scope).
        injectRegister: null,
        // Manifests live in public/ (Hebrew default + English), swapped on language change.
        manifest: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
          rollupFormat: 'iife',
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5174,
      strictPort: true,
      proxy: { '/api': { target: proxyTarget, changeOrigin: true, ws: true } },
    },
    preview: { port: 4174 },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  };
});
