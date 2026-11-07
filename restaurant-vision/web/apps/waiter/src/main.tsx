import '@rv/shared/styles.css';
import { initTheme } from '@rv/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initWaiterI18n } from './i18n';
import { installLanguageSync, registerServiceWorker } from './lib/serviceWorker';

async function bootstrap() {
  const mock = import.meta.env.VITE_MOCK === '1';
  if (mock) {
    // MSW's worker owns the scope in mock mode, so the PWA worker is not registered.
    const { startMockWorker } = await import('@rv/shared/mock/browser');
    await startMockWorker({ baseUrl: import.meta.env.BASE_URL });
  } else if (import.meta.env.PROD) {
    registerServiceWorker();
  }
  initWaiterI18n();
  initTheme();
  installLanguageSync();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
