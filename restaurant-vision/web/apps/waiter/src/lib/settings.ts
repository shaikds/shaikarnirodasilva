// Per-phone waiter settings, persisted to localStorage through try/catch-wrapped storage.
import { safeStateStorage } from '@rv/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  edgeUrl: string;
  sound: boolean;
  vibrate: boolean;
  /** Id returned by `POST /push/subscriptions`, to unsubscribe later. */
  pushSubscriptionId: string | null;
  setEdgeUrl: (url: string) => void;
  setSound: (on: boolean) => void;
  setVibrate: (on: boolean) => void;
  setPushSubscriptionId: (id: string | null) => void;
}

export const useWaiterSettings = create<WaiterSettings>()(
  persist(
    (set) => ({
      edgeUrl: DEFAULT_EDGE_URL,
      sound: true,
      vibrate: true,
      pushSubscriptionId: null,
      setEdgeUrl: (url) => set({ edgeUrl: isValidEdgeUrl(url) ? url.trim() : DEFAULT_EDGE_URL }),
      setSound: (sound) => set({ sound }),
      setVibrate: (vibrate) => set({ vibrate }),
      setPushSubscriptionId: (pushSubscriptionId) => set({ pushSubscriptionId }),
    }),
    {
      name: WAITER_SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStateStorage),
      partialize: (s) => ({
        edgeUrl: s.edgeUrl,
        sound: s.sound,
        vibrate: s.vibrate,
        pushSubscriptionId: s.pushSubscriptionId,
      }),
    },
  ),
);
