// Provides the LAN API client plus the setup-PIN session (sessionStorage) to the tree.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { LocalApiContext, type LocalApiContextValue } from './context';
import { createLocalApi, type PinProblem } from './localApi';
import { clearPin, readPin, storePin } from './pin';

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
