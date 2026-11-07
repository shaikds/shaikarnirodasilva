/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { mswWorkerPlugin } from '@rv/shared/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000';
  return {
    plugins: [react(), mswWorkerPlugin()],
    server: {
      port: 5173,
      strictPort: true,
      // Same-origin API in dev: /api (REST + WebSocket) goes to the cloud backend.
      proxy: { '/api': { target: proxyTarget, changeOrigin: true, ws: true } },
    },
    preview: { port: 4173 },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
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
