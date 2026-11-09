// Context + hooks for the LAN API client and the setup-PIN session (see LocalApiProvider).
import { createContext, useContext } from 'react';
import type { LocalApi, PinProblem } from './localApi';

export interface PinSession {
  /** The PIN this tab has unlocked setup with, or null. */
  pin: string | null;
  /** Why the last setup call was rejected (cleared on the next successful unlock). */
  problem: PinProblem | null;
  /** With `problem === 'locked'`: seconds the edge asked to wait (`Retry-After`), if known. */
  retryAfterS: number | null;
  unlock: (pin: string) => void;
  lock: (problem?: PinProblem | null) => void;
}

export interface LocalApiContextValue {
  api: LocalApi;
  session: PinSession;
}

export const LocalApiContext = createContext<LocalApiContextValue | null>(null);

export function useLocalApi(): LocalApi {
  const ctx = useContext(LocalApiContext);
  if (!ctx) throw new Error('useLocalApi must be used inside <LocalApiProvider>');
  return ctx.api;
}

export function usePinSession(): PinSession {
  const ctx = useContext(LocalApiContext);
  if (!ctx) throw new Error('usePinSession must be used inside <LocalApiProvider>');
  return ctx.session;
}
