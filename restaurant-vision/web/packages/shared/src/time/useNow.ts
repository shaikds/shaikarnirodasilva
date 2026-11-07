// One shared 1 s ticker for every timer on screen (table timers, alert ages).
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time in epoch seconds, re-rendering every second. */
export function useNow(): number {
  const ms = useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
  return ms / 1000;
}
