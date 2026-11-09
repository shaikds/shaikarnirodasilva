// Per-phone waiter settings, persisted to localStorage through try/catch-wrapped storage.
import { safeStateStorage } from '@rv/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Last-resort offline link when no edge has reported its LAN address yet. */
export const DEFAULT_EDGE_URL = 'http://rv-edge.local:8787/local-alerts';
export const WAITER_SETTINGS_KEY = 'rv-waiter-settings';

export function isValidEdgeUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

interface WaiterSettings {
  /** Manual override of the offline link; null = automatic (the site's edge, see useEdgeUrl). */
  edgeUrl: string | null;
  /**
   * Offline links derived from `GET /sites/{id}/devices` (`<local_url>/local-alerts`) per site,
   * kept so the link still works after a reload while the cloud is unreachable.
   */
  autoEdgeUrls: Record<string, string>;
  sound: boolean;
  vibrate: boolean;
  /** Id returned by `POST /push/subscriptions`, to unsubscribe later. */
  pushSubscriptionId: string | null;
  /** A valid URL sets the override; null or an invalid URL goes back to automatic. */
  setEdgeUrl: (url: string | null) => void;
  setAutoEdgeUrl: (siteId: string, url: string) => void;
  setSound: (on: boolean) => void;
  setVibrate: (on: boolean) => void;
  setPushSubscriptionId: (id: string | null) => void;
}

interface PersistedV1 {
  edgeUrl?: string;
}

export const useWaiterSettings = create<WaiterSettings>()(
  persist(
    (set) => ({
      edgeUrl: null,
      autoEdgeUrls: {},
      sound: true,
      vibrate: true,
      pushSubscriptionId: null,
      setEdgeUrl: (url) => set({ edgeUrl: url && isValidEdgeUrl(url) ? url.trim() : null }),
      setAutoEdgeUrl: (siteId, url) =>
        set((s) =>
          s.autoEdgeUrls[siteId] === url ? s : { autoEdgeUrls: { ...s.autoEdgeUrls, [siteId]: url } },
        ),
      setSound: (sound) => set({ sound }),
      setVibrate: (vibrate) => set({ vibrate }),
      setPushSubscriptionId: (pushSubscriptionId) => set({ pushSubscriptionId }),
    }),
    {
      name: WAITER_SETTINGS_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStateStorage),
      // v1 stored the default address as a value: that now means "automatic".
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as PersistedV1 & Record<string, unknown>;
        if (version < 2 && state.edgeUrl === DEFAULT_EDGE_URL) state.edgeUrl = undefined;
        return { autoEdgeUrls: {}, ...state, edgeUrl: state.edgeUrl ?? null } as unknown as WaiterSettings;
      },
      partialize: (s) => ({
        edgeUrl: s.edgeUrl,
        autoEdgeUrls: s.autoEdgeUrls,
        sound: s.sound,
        vibrate: s.vibrate,
        pushSubscriptionId: s.pushSubscriptionId,
      }),
    },
  ),
);
