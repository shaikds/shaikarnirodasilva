import '@rv/shared/styles.css';
import { initTheme } from '@rv/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initDashboardI18n } from './i18n';

async function bootstrap() {
  // VITE_MOCK=1: MSW mock backend + fake live stream; tree-shaken from normal builds.
  if (import.meta.env.VITE_MOCK === '1') {
    const { startMockWorker } = await import('@rv/shared/mock/browser');
    await startMockWorker({ baseUrl: import.meta.env.BASE_URL });
  }
  initDashboardI18n();
  initTheme();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
