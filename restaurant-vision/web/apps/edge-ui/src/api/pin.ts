// The setup PIN lives in sessionStorage only (cleared when the tab closes), never in
// localStorage. Every access is wrapped: private mode and blocked storage just mean "ask again".
const PIN_KEY = 'rv-edge-setup-pin';

function session(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** In-memory copy so the PIN still works for this page view when storage is unavailable. */
let memoryPin: string | null = null;

export function readPin(): string | null {
  try {
    const stored = session()?.getItem(PIN_KEY);
    if (stored) return stored;
  } catch {
    // fall through to the in-memory copy
  }
  return memoryPin;
}

export function storePin(pin: string): void {
  memoryPin = pin;
  try {
    session()?.setItem(PIN_KEY, pin);
  } catch {
    // ignore: memory copy is enough for this page view
  }
}

export function clearPin(): void {
  memoryPin = null;
  try {
    session()?.removeItem(PIN_KEY);
  } catch {
    // ignore
  }
}
