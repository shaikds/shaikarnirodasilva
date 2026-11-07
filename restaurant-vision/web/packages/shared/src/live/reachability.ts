// Tracks whether the cloud API answers. The API client reports every request; the waiter
// app shows its offline banner when the API or the live socket has been down for > 10 s.
import { create } from 'zustand';

interface ReachabilityState {
  /** Epoch ms since the API has been failing; null while it answers. */
  apiDownSince: number | null;
  lastOkAt: number | null;
}

export const useReachability = create<ReachabilityState>(() => ({
  apiDownSince: null,
  lastOkAt: null,
}));

export function reportReachability(reachable: boolean): void {
  const s = useReachability.getState();
  if (reachable) {
    if (s.apiDownSince !== null || s.lastOkAt === null || Date.now() - s.lastOkAt > 1000) {
      useReachability.setState({ apiDownSince: null, lastOkAt: Date.now() });
    }
  } else if (s.apiDownSince === null) {
    useReachability.setState({ apiDownSince: Date.now() });
  }
}
