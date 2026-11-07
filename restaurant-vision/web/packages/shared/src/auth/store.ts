// Auth store (zustand, persisted to localStorage through try/catch-wrapped storage).
// Holds tokens and the user's chosen site; the user profile itself comes from `GET /me`
// through React Query so it is always fresh.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TokenPair } from '../contracts';
import { safeStateStorage } from '../lib/storage';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Epoch ms when the access token expires (from `expires_in`); informational. */
  accessExpiresAt: number | null;
  /** Site picked by the user (waiter app site picker, dashboard site switcher). */
  selectedSiteId: string | null;
  setTokens: (pair: TokenPair) => void;
  setSelectedSite: (siteId: string | null) => void;
  logout: () => void;
}

export const AUTH_STORAGE_KEY = 'rv-auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      accessExpiresAt: null,
      selectedSiteId: null,
      setTokens: (pair) =>
        set({
          accessToken: pair.access_token,
          refreshToken: pair.refresh_token,
          accessExpiresAt: Date.now() + pair.expires_in * 1000,
        }),
      setSelectedSite: (siteId) => set({ selectedSiteId: siteId }),
      logout: () =>
        set({ accessToken: null, refreshToken: null, accessExpiresAt: null, selectedSiteId: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStateStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        accessExpiresAt: s.accessExpiresAt,
        selectedSiteId: s.selectedSiteId,
      }),
    },
  ),
);

/** True when a session (refresh token) exists. */
export const selectIsAuthenticated = (s: AuthState): boolean => s.refreshToken !== null;

/** Adapter the API client uses to read and update tokens. */
export const authStoreAdapter = {
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  setTokens: (pair: TokenPair) => useAuthStore.getState().setTokens(pair),
  clear: () => useAuthStore.getState().logout(),
};
