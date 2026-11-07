// Detects alerts that appear after the first load (from the socket or from polling) and
// fires sound, vibration, a page notification when hidden, and a screen-reader message.
import { currentLanguage, useTranslation, type AlertView } from '@rv/shared';
import { useEffect, useRef, useState } from 'react';
import { alertTitle } from './alertText';
import { buildNotification } from './notification';
import { showLocalNotification } from './push';
import { useWaiterSettings } from './settings';
import { playAlertSound, vibrate } from './sound';

export function useNewAlerts(alerts: AlertView[] | undefined, siteId: string | undefined): string {
  const { t } = useTranslation();
  const seen = useRef<Set<string> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sound = useWaiterSettings((s) => s.sound);
  const vib = useWaiterSettings((s) => s.vibrate);

  useEffect(() => {
    seen.current = null;
  }, [siteId]);

  useEffect(() => {
    if (!alerts) return;
    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a.alert_id));
      return;
    }
    const fresh = alerts.filter((a) => a.status === 'open' && !seen.current!.has(a.alert_id));
    alerts.forEach((a) => seen.current!.add(a.alert_id));
    if (fresh.length === 0) return;
    const urgent = fresh.some((a) => a.severity === 'urgent');
    if (sound) playAlertSound(urgent);
    if (vib) vibrate(urgent);
    const latest = fresh[fresh.length - 1]!;
    setAnnouncement(t('alerts.newAlert', { what: `${alertTitle(latest, t)} · ${t(`common:alertKind.${latest.kind}`)}` }));
    if (typeof document !== 'undefined' && document.hidden) {
      for (const a of fresh) {
        const { title, options } = buildNotification(a, currentLanguage());
        void showLocalNotification(title, options);
      }
    }
  }, [alerts, sound, vib, t]);

  return announcement;
}
