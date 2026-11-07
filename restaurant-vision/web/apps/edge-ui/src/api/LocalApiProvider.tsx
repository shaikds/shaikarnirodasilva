// Provides the LAN API client plus the setup-PIN session (sessionStorage) to the tree.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createLocalApi, type LocalApi, type PinProblem } from './localApi';
import { clearPin, readPin, storePin } from './pin';

interface PinSession {
  /** The PIN this tab has unlocked setup with, or null. */
  pin: string | null;
  /** Why the last setup call was rejected (cleared on the next successful unlock). */
  problem: PinProblem | null;
  unlock: (pin: string) => void;
  lock: (problem?: PinProblem | null) => void;
}

interface LocalApiContextValue {
  api: LocalApi;
  session: PinSession;
}

const LocalApiContext = createContext<LocalApiContextValue | null>(null);

export interface LocalApiProviderProps {
  children: ReactNode;
  /** Edge origin; defaults to the page origin. */
  baseUrl?: string;
  /** Custom fetch (tests). */
  fetchImpl?: typeof fetch;
}

export function LocalApiProvider({ children, baseUrl, fetchImpl }: LocalApiProviderProps) {
  const [pin, setPin] = useState<string | null>(() => readPin());
  const [problem, setProblem] = useState<PinProblem | null>(null);

  const lock = useCallback((why: PinProblem | null = null) => {
    clearPin();
    setPin(null);
    setProblem(why);
  }, []);

  const unlock = useCallback((value: string) => {
    storePin(value);
    setPin(value);
    setProblem(null);
  }, []);

  const api = useMemo(
    () =>
      createLocalApi({
        baseUrl,
        fetch: fetchImpl,
        getPin: readPin,
        // A 429 keeps the PIN (it may be right; the lockout is per client) but still stops setup.
        onPinProblem: (why) => (why === 'invalid' ? lock('invalid') : setProblem('locked')),
      }),
    [baseUrl, fetchImpl, lock],
  );

  const value = useMemo<LocalApiContextValue>(
    () => ({ api, session: { pin, problem, unlock, lock } }),
    [api, pin, problem, unlock, lock],
  );
  return <LocalApiContext.Provider value={value}>{children}</LocalApiContext.Provider>;
}

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
