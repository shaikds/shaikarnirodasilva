import '@rv/shared/styles.css';
import { initTheme } from '@rv/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initEdgeI18n } from './i18n';

async function bootstrap() {
  // VITE_MOCK=1: an in-browser fake edge (MSW) for UI work without Python; tree-shaken otherwise.
  if (import.meta.env.VITE_MOCK === '1') {
    const { startEdgeMock } = await import('./mock/browser');
    await startEdgeMock({ baseUrl: import.meta.env.BASE_URL });
  }
  initEdgeI18n();
  initTheme();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
