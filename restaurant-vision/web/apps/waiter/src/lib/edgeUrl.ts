// The waiter's offline link: `<local_url>/local-alerts` of the site's edge, from
// `GET /sites/{id}/devices` (waiters get a reduced view with `online` and `local_url`). An online
// device wins over an offline one, then the most recently seen. A manual address in Settings
// overrides it; `rv-edge.local` is the last resort before any edge has reported its address.
import { useDevices, type DeviceStatus } from '@rv/shared';
import { useEffect, useMemo } from 'react';
import { DEFAULT_EDGE_URL, isValidEdgeUrl, useWaiterSettings } from './settings';

export const LOCAL_ALERTS_PATH = '/local-alerts';

/** `<local_url>/local-alerts`, or null when `localUrl` is not an http(s) URL. */
export function localAlertsUrl(localUrl: string | null | undefined): string | null {
  if (!localUrl || !isValidEdgeUrl(localUrl)) return null;
  return `${localUrl.trim().replace(/\/+$/, '')}${LOCAL_ALERTS_PATH}`;
}

/** The device whose LAN address waiters should use: online first, then most recently seen. */
export function pickEdgeDevice(devices: readonly DeviceStatus[]): DeviceStatus | null {
  const candidates = devices.filter((d) => localAlertsUrl(d.local_url) !== null);
  candidates.sort(
    (a, b) =>
      Number(b.online) - Number(a.online) || (b.last_seen_at ?? -1) - (a.last_seen_at ?? -1),
  );
  return candidates[0] ?? null;
}

export type EdgeUrlSource = 'manual' | 'edge' | 'default';

export interface EdgeUrl {
  url: string;
  source: EdgeUrlSource;
  /** The automatic address (edge or default), what "reset" goes back to. */
  automatic: string;
}

export function useEdgeUrl(siteId: string | undefined): EdgeUrl {
  const manual = useWaiterSettings((s) => s.edgeUrl);
  const saved = useWaiterSettings((s) => (siteId ? (s.autoEdgeUrls[siteId] ?? null) : null));
  const setAutoEdgeUrl = useWaiterSettings((s) => s.setAutoEdgeUrl);
  const devices = useDevices(siteId);
  const derived = useMemo(
    () => localAlertsUrl(pickEdgeDevice(devices.data ?? [])?.local_url),
    [devices.data],
  );
  useEffect(() => {
    if (siteId && derived) setAutoEdgeUrl(siteId, derived);
  }, [siteId, derived, setAutoEdgeUrl]);

  const edge = derived ?? saved;
  const automatic = edge ?? DEFAULT_EDGE_URL;
  if (manual) return { url: manual, source: 'manual', automatic };
  return { url: automatic, source: edge ? 'edge' : 'default', automatic };
}
