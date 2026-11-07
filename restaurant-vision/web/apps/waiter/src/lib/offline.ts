// Offline detection for the banner: the cloud API or the live socket unreachable > 10 s.
import { useNow, useReachability, type LiveConnection } from '@rv/shared';
import { useEffect, useState } from 'react';

export const OFFLINE_AFTER_MS = 10_000;

export interface OfflineInputs {
  /** Epoch ms since API requests fail (null while they succeed). */
  apiDownSince: number | null;
  /** Epoch ms since the live socket is not open (null while open). */
  wsDownSince: number | null;
  /** Epoch ms since the browser reports no network (null while online). */
  browserOfflineSince: number | null;
  nowMs: number;
}

/** True once any channel has been down for more than OFFLINE_AFTER_MS. */
export function isOffline(i: OfflineInputs): boolean {
  const since = [i.apiDownSince, i.wsDownSince, i.browserOfflineSince].filter(
    (v): v is number => v !== null,
  );
  if (since.length === 0) return false;
  return i.nowMs - Math.min(...since) > OFFLINE_AFTER_MS;
}

function useBrowserOfflineSince(): number | null {
  const [since, setSince] = useState<number | null>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? Date.now() : null,
  );
  useEffect(() => {
    const off = () => setSince((s) => s ?? Date.now());
    const on = () => setSince(null);
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, []);
  return since;
}

export function useOffline(connection: LiveConnection | undefined): boolean {
  const apiDownSince = useReachability((s) => s.apiDownSince);
  const browserOfflineSince = useBrowserOfflineSince();
  const now = useNow();
  return isOffline({
    apiDownSince,
    wsDownSince: connection && connection.status !== 'open' ? connection.downSince : null,
    browserOfflineSince,
    nowMs: now * 1000,
  });
}
