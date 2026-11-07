// Light / dark / system theme, persisted (try/catch storage) and applied as `.dark` on <html>.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStateStorage } from '../lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode);
      },
    }),
    {
      name: 'rv-theme',
      storage: createJSONStorage(() => safeStateStorage),
      onRehydrateStorage: () => (state) => applyTheme(state?.mode ?? 'system'),
    },
  ),
);

/** Applies the stored theme now and follows OS changes while in `system` mode. */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().mode);
  try {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => applyTheme(useThemeStore.getState().mode));
  } catch {
    // old browsers / tests
  }
}
