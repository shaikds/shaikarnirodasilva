/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { mswWorkerPlugin } from '@rv/shared/vite';
import { defineConfig, loadEnv } from 'vite';

// The edge serves the built app from `dist/` at `/` (rv_edge settings.edge_ui_dir), so the base
// is `/` and API calls are same-origin `/local/*`. In dev, `/local` (REST + WebSocket) is
// proxied to a running edge (`VITE_EDGE_URL`, default http://localhost:8787).
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const edgeTarget = env.VITE_EDGE_URL || 'http://localhost:8787';
  return {
    base: '/',
    plugins: [react(), mswWorkerPlugin()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: { '/local': { target: edgeTarget, changeOrigin: true, ws: true } },
    },
    preview: { port: 4175 },
    build: {
      outDir: 'dist',
      // No source maps: the bundle is served on the restaurant LAN; keep the payload small.
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  };
});
