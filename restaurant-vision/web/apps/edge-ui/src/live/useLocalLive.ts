// Live state from the edge on the LAN: `GET /local/state`, then `WS /local/ws`, which pushes
// EdgeEvents plus a full `live.snapshot` on connect and every few seconds. Events are merged with
// the shared `applyEvent`; while the socket is down the snapshot is polled instead.
import {
  applyEvent,
  LiveSocket,
  type EdgeEvent,
  type LiveSnapshot,
  type LiveStatus,
} from '@rv/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocalApi } from '../api/context';

export const LOCAL_STATE_KEY = ['local', 'state'] as const;

const POLL_MS_WHILE_DOWN = 4_000;

export interface LocalLive {
  data: LiveSnapshot | undefined;
  isLoading: boolean;
  isError: boolean;
  status: LiveStatus;
  /** Edge clock minus this device's clock, in seconds (simulated or skewed clocks). */
  clockOffsetS: number;
  /** Wall-clock ms of the last message from the edge (REST or WS). */
  lastUpdateAt: number | null;
  refetch: () => void;
}

export interface UseLocalLiveOptions {
  onEvent?: (event: EdgeEvent) => void;
  WebSocketImpl?: typeof WebSocket;
}

export function useLocalLive(options: UseLocalLiveOptions = {}): LocalLive {
  const api = useLocalApi();
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [clockOffsetS, setClockOffsetS] = useState(0);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const { WebSocketImpl } = options;

  const query = useQuery({
    queryKey: LOCAL_STATE_KEY,
    queryFn: ({ signal }) => api.state(signal),
    staleTime: 2_000,
    refetchInterval: status === 'open' ? false : POLL_MS_WHILE_DOWN,
    refetchIntervalInBackground: true,
  });

  // Every fresh snapshot (REST or socket) re-anchors the edge clock.
  const snapshotTs = query.data?.ts;
  useEffect(() => {
    if (snapshotTs === undefined) return;
    setClockOffsetS(snapshotTs - Date.now() / 1000);
    setLastUpdateAt(Date.now());
  }, [snapshotTs]);

  useEffect(() => {
    const pending: EdgeEvent[] = [];
    const socket = new LiveSocket({
      getUrl: () => api.wsUrl(),
      WebSocketImpl,
      backoff: { initialMs: 1000, maxMs: 10_000 },
      onStatus: setStatus,
      onOpen: (reconnected) => {
        if (reconnected) void qc.invalidateQueries({ queryKey: LOCAL_STATE_KEY });
      },
      onSnapshot: (snapshot) => {
        const merged = pending.splice(0).reduce(applyEvent, snapshot);
        qc.setQueryData<LiveSnapshot>(LOCAL_STATE_KEY, merged);
      },
      onEvent: (event) => {
        const current = qc.getQueryData<LiveSnapshot>(LOCAL_STATE_KEY);
        if (current) qc.setQueryData<LiveSnapshot>(LOCAL_STATE_KEY, applyEvent(current, event));
        else pending.push(event);
        setLastUpdateAt(Date.now());
        // An event can be newer than the last snapshot's clock (e.g. a simulator at 20x).
        setClockOffsetS((o) => Math.max(o, event.ts - Date.now() / 1000));
        onEventRef.current?.(event);
      },
    });
    socket.start();
    return () => socket.stop();
  }, [api, qc, WebSocketImpl]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    status,
    clockOffsetS,
    lastUpdateAt,
    refetch: () => void query.refetch(),
  };
}

/** Edge-clock "now" in epoch seconds, ticking every `intervalMs`. */
export function useEdgeNow(clockOffsetS: number, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now + clockOffsetS;
}
