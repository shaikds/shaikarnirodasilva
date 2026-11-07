// Web Push: subscribe with the cloud's VAPID key and register the subscription for a site.
import type { RvApi } from '@rv/shared';

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): PushState {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission as PushState;
}

/** URL-safe base64 VAPID key -> bytes for `applicationServerKey`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export class PushError extends Error {
  constructor(readonly reason: 'unsupported' | 'denied' | 'no-service-worker' | 'failed') {
    super(reason);
  }
}

function serviceWorkerReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new PushError('no-service-worker')), timeoutMs),
    ),
  ]);
}

/** Asks permission, subscribes and registers with `POST /push/subscriptions`. Returns its id. */
export async function enablePush(api: RvApi, siteId: string): Promise<string> {
  if (!pushSupported()) throw new PushError('unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('denied');
  const reg = await serviceWorkerReady();
  const { public_key } = await api.getVapidPublicKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new PushError('failed');
  const out = await api.createPushSubscription({
    site_id: siteId,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return out.subscription_id;
}

export async function disablePush(api: RvApi, subscriptionId: string | null): Promise<void> {
  if (subscriptionId) await api.deletePushSubscription(subscriptionId).catch(() => undefined);
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

/** Shows a notification from the page (app open but hidden); same tag as push, so no duplicates. */
export async function showLocalNotification(
  title: string,
  options: NotificationOptions,
): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.showNotification(title, options);
}
