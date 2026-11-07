import { describe, expect, it } from 'vitest';
import { buildNotification, normalizePayload } from '../lib/notification';
import { urlBase64ToUint8Array } from '../lib/push';

describe('push notifications', () => {
  it('titles the notification with the table label and alert kind', () => {
    const he = buildNotification(
      { alert_id: 'a1', kind: 'waiter_needed', table_label: '12', severity: 'warn' },
      'he',
    );
    expect(he.title).toBe('שולחן 12 · דרוש מלצר');
    expect(he.options).toMatchObject({
      tag: 'a1',
      lang: 'he',
      dir: 'rtl',
      requireInteraction: false,
    });
    const en = buildNotification(
      { alert_id: 'a1', kind: 'waiter_needed', table_label: '12' },
      'en',
    );
    expect(en.title).toBe('Table 12 · Waiter needed');
  });

  it('handles queue alerts, urgent alerts and wrapped AlertView payloads', () => {
    const q = buildNotification(
      normalizePayload({
        alert: { alert_id: 'q1', kind: 'long_queue', table_label: null, severity: 'urgent' },
      }),
      'en',
    );
    expect(q.title).toBe('Entrance · Long queue at the entrance');
    expect(q.options.requireInteraction).toBe(true);
    expect(q.options.body).toMatch(/^Urgent/);
  });

  it('falls back to a generic title for unknown payloads', () => {
    expect(buildNotification(normalizePayload('garbage'), 'en').title).toBe('New table alert');
  });

  it('decodes URL-safe base64 VAPID keys', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});
