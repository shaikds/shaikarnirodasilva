// MSW handlers for the edge LAN API (`/local/*`) backed by EdgeMockDb, plus `WS /local/ws`.
import type { SiteConfig } from '@rv/shared';
import {
  http,
  HttpResponse,
  ws,
  type HttpHandler,
  type HttpResponseResolver,
  type PathParams,
  type WebSocketHandler,
} from 'msw';
import type { CameraIn, CameraUpdate, SuggestTablesIn } from '../api/types';
import { PIN_MAX_LEN, PIN_MIN_LEN } from '../api/types';
import { ID_PATTERN } from '../lib/validation';
import { mockSnapshotSvg, type EdgeMockDb, type MockCamera } from './db';

const detail = (status: number, message: string) => HttpResponse.json({ detail: message }, { status });

function withCredentials(url: string, username?: string | null, password?: string | null): string {
  if (!username) return url;
  const m = /^([a-z][a-z0-9+.-]*:\/\/)(?:[^/@]*@)?(.*)$/i.exec(url);
  if (!m) return url;
  const userinfo = encodeURIComponent(username) + (password ? `:${encodeURIComponent(password)}` : '');
  return `${m[1]}${userinfo}@${m[2]}`;
}

export function createEdgeHandlers(db: EdgeMockDb): (HttpHandler | WebSocketHandler)[] {
  /** Runs `fn` only with the right `X-Setup-Pin` (401 / 429 otherwise), like require_pin. */
  const guarded =
    <P extends PathParams>(fn: HttpResponseResolver<P>): HttpResponseResolver<P> =>
    (info) => {
      db.lastSetupHeaders = info.request.headers;
      const problem = db.checkPin(info.request.headers.get('X-Setup-Pin'));
      if (problem === 429) {
        const wait = Math.max(1, Math.ceil((db.lockedUntil - Date.now()) / 1000));
        return HttpResponse.json(
          { detail: 'too many wrong PINs; wait' },
          { status: 429, headers: { 'Retry-After': String(wait) } },
        );
      }
      if (problem === 401) return detail(401, db.pin === null ? 'setup PIN not set' : 'invalid setup PIN');
      return fn(info);
    };

  const liveSocket = ws.link('*/local/ws');

  return [
    http.get('*/local/health', () => HttpResponse.json({ status: 'ok', version: '0.1.0-mock' })),
    http.get('*/local/state', () => HttpResponse.json(db.liveSnapshot())),
    http.get('*/local/setup/status', () => HttpResponse.json(db.status())),

    http.post('*/local/setup-pin', async ({ request }) => {
      const body = (await request.json()) as { pin?: unknown };
      const pin = typeof body.pin === 'string' ? body.pin : '';
      if (pin.length < PIN_MIN_LEN || pin.length > PIN_MAX_LEN)
        return HttpResponse.json(
          { detail: [{ loc: ['body', 'pin'], msg: `String should have at least ${PIN_MIN_LEN} characters`, type: 'string_too_short' }] },
          { status: 422 },
        );
      if (db.pin !== null) return detail(409, 'setup PIN already set');
      db.pin = pin;
      return HttpResponse.json({ pin_set: true }, { status: 201 });
    }),

    http.post<{ alertId: string }>('*/local/alerts/:alertId/ack', ({ params }) => {
      const view = db.ack(params.alertId);
      return view ? HttpResponse.json(view) : detail(404, 'no open alert with this id');
    }),

    // -------------------------------------------------------------- setup (PIN)
    http.get('*/local/setup/pin-check', guarded(() => new HttpResponse(null, { status: 204 }))),
    http.get(
      '*/local/cameras',
      guarded(() => HttpResponse.json([...db.cameras.values()].map((c) => db.cameraOut(c)))),
    ),
    http.post(
      '*/local/cameras/discover',
      guarded(() =>
        HttpResponse.json({
          available: true,
          devices: [
            { address: '192.168.1.64', xaddrs: [], manufacturer: 'HIKVISION', model: 'DS-2CD2143G2', name: 'Dining' },
            { address: '192.168.1.70', xaddrs: [], manufacturer: 'Dahua', model: 'IPC-HDW2431T', name: null },
          ],
          error: null,
        }),
      ),
    ),
    http.post(
      '*/local/cameras',
      guarded(async ({ request }) => {
        const body = (await request.json()) as CameraIn;
        if (!ID_PATTERN.test(body.camera_id ?? '')) return detail(422, 'invalid camera_id');
        if (!/^(rtsps?|https?):\/\//.test(body.url ?? '')) return detail(422, 'rtsp cameras need an rtsp:// (or http://) URL');
        if (db.cameras.has(body.camera_id)) return detail(409, 'camera already exists');
        const cam: MockCamera = {
          camera_id: body.camera_id,
          kind: body.kind ?? 'rtsp',
          url: withCredentials(body.url, body.username, body.password),
          loop: body.loop ?? true,
          options: body.options ?? {},
        };
        db.cameras.set(cam.camera_id, cam);
        return HttpResponse.json(db.cameraOut(cam), { status: 201 });
      }),
    ),
    http.put(
      '*/local/cameras/:cameraId',
      guarded<{ cameraId: string }>(async ({ request, params }) => {
        const existing = db.cameras.get(params.cameraId);
        // Simulated cameras are not stored ones: the edge answers 404 like for unknown ids.
        if (!existing || existing.kind === 'simulated') return detail(404, 'unknown camera');
        const body = (await request.json()) as CameraUpdate;
        const url = body.url ?? existing.url;
        const next: MockCamera = {
          ...existing,
          kind: body.kind ?? existing.kind,
          url: withCredentials(url, body.username, body.password),
          options: body.options ?? existing.options,
        };
        db.cameras.set(next.camera_id, next);
        return HttpResponse.json(db.cameraOut(next));
      }),
    ),
    http.delete(
      '*/local/cameras/:cameraId',
      guarded<{ cameraId: string }>(({ params }) => {
        if (db.cameras.get(params.cameraId)?.kind === 'simulated') return detail(404, 'unknown camera');
        if (!db.cameras.delete(params.cameraId)) return detail(404, 'unknown camera');
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    http.get(
      '*/local/cameras/:cameraId/snapshot.jpg',
      guarded<{ cameraId: string }>(({ params }) => {
        if (!db.hasCamera(params.cameraId)) return detail(404, 'unknown camera');
        const masks = db.config
          ? [
              ...db.config.cameras.filter((c) => c.camera_id === params.cameraId).flatMap((c) => c.privacy_masks),
              ...db.config.zones
                .filter((z) => z.camera_id === params.cameraId && z.kind === 'privacy' && z.polygon)
                .map((z) => z.polygon!),
            ]
          : [];
        const label = db.isSimulated(params.cameraId) ? 'simulated camera' : `camera ${params.cameraId}`;
        return new HttpResponse(mockSnapshotSvg(label, masks), {
          headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store, max-age=0' },
        });
      }),
    ),
    http.post(
      '*/local/cameras/:cameraId/suggest-tables',
      guarded<{ cameraId: string }>(async ({ request, params }) => {
        if (!db.hasCamera(params.cameraId)) return detail(404, 'unknown camera');
        let body: SuggestTablesIn = {};
        try {
          body = ((await request.json()) as SuggestTablesIn | null) ?? {};
        } catch {
          body = {};
        }
        const min = body.min_confidence ?? 0.25;
        return HttpResponse.json({
          camera_id: params.cameraId,
          suggestions: db.suggestions.filter((s) => s.confidence >= min),
          note: db.suggestNote,
        });
      }),
    ),
    http.get(
      '*/local/config',
      guarded(() => (db.config ? HttpResponse.json(db.config) : detail(404, 'no site config yet'))),
    ),
    http.put(
      '*/local/config',
      guarded(async ({ request }) => {
        const body = (await request.json()) as SiteConfig;
        const errors = db.configErrors(body);
        if (errors.length)
          return HttpResponse.json(
            {
              detail: [
                {
                  loc: ['body'],
                  msg: `Value error, invalid site config: ${errors.join('; ')}`,
                  type: 'value_error',
                },
              ],
            },
            { status: 422 },
          );
        if (db.paired && db.siteId && body.site_id !== db.siteId)
          return detail(409, `config is for site '${body.site_id}' but this edge is paired with '${db.siteId}'`);
        return HttpResponse.json(db.saveConfig(body));
      }),
    ),
    http.get(
      '*/local/coverage',
      guarded(() =>
        HttpResponse.json({ site_id: db.config?.site_id ?? 'local', uncovered_table_ids: db.coverage() }),
      ),
    ),
    http.post(
      '*/local/uniform/calibrate',
      guarded(async ({ request }) => {
        const body = (await request.json()) as { camera_id: string; box: number[] };
        if (!db.hasCamera(body.camera_id)) return detail(404, 'unknown camera');
        if (db.isSimulated(body.camera_id)) return detail(409, 'uniform calibration needs a real camera image');
        db.uniformHsv = [212, 0.62, 0.35];
        return HttpResponse.json({ uniform_hsv: db.uniformHsv });
      }),
    ),
    http.post(
      '*/local/pair',
      guarded(async ({ request }) => {
        const body = (await request.json()) as { code: string; cloud_url: string };
        if (body.code === 'BADCODE') return detail(400, 'invalid or expired pairing code');
        db.paired = true;
        db.siteId = db.config?.site_id ?? 'demo-site';
        db.deviceId = 'dev-1';
        db.cloudUrl = body.cloud_url;
        return HttpResponse.json({ device_id: db.deviceId, site_id: db.siteId });
      }),
    ),

    // -------------------------------------------------------------- live socket
    liveSocket.addEventListener('connection', ({ client }) => {
      client.send(JSON.stringify({ type: 'live.snapshot', snapshot: db.liveSnapshot() }));
      const off = db.subscribe((message) => client.send(message));
      client.addEventListener('close', off);
    }),
  ];
}
