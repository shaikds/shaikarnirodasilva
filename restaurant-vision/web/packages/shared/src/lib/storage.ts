// localStorage access that never throws: private mode, disabled storage, quota errors and
// sandboxed iframes all degrade to "no persistence" instead of crashing the app.
import type { StateStorage } from 'zustand/middleware';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

/** zustand `persist` storage backed by the safe helpers. */
export const safeStateStorage: StateStorage = {
  getItem: (name) => safeGetItem(name),
  setItem: (name, value) => {
    safeSetItem(name, value);
  },
  removeItem: (name) => safeRemoveItem(name),
};
