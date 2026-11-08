// `pnpm dev:mock` (VITE_MOCK=1): a fake edge in the browser (MSW service worker + WebSocket
// interception) with a demo restaurant, so the UI can be developed without Python.
import { setupWorker } from 'msw/browser';
import { EdgeMockDb } from './db';
import { createEdgeHandlers } from './handlers';

export async function startEdgeMock(options: { baseUrl?: string } = {}): Promise<EdgeMockDb> {
  const db = new EdgeMockDb({
    cameras: [
      { camera_id: 'dining', kind: 'rtsp', url: 'rtsp://admin:demo@192.168.1.64:554/Streaming/Channels/102', loop: true },
    ],
  });
  const worker = setupWorker(...createEdgeHandlers(db));
  const base = (options.baseUrl ?? '/').replace(/\/?$/, '/');
  await worker.start({
    serviceWorker: { url: `${base}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
  db.startSimulation(5000);
  console.info('[rv] Mock edge active (VITE_MOCK=1). Choose any setup PIN.');
  return db;
}
