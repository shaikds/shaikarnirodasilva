// useSiteLive(siteId): initial `GET /sites/{id}/live`, then `WS /api/v1/ws?token=&site_id=`
// with reconnect + backoff. Every event is merged into the React Query cache; on reconnect
// the snapshot is refetched to recover anything missed.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApi, useApiClient } from '../api/provider';
import { queryKeys } from '../api/queryKeys';
import type { EdgeEvent, LiveSnapshot } from '../contracts';
import { applyEvent } from './applyEvent';
import { LiveSocket, type BackoffOptions, type LiveStatus } from './socket';

export interface LiveConnection {
  status: LiveStatus;
  /** Epoch ms since the socket has not been open (null while open). */
  downSince: number | null;
  /** Epoch ms of the last event received. */
  lastEventAt: number | null;
}

export interface UseSiteLiveOptions {
  /** Called for every event of this site (after it was merged into the cache). */
  onEvent?: (event: EdgeEvent) => void;
  /** Turn the socket off (e.g. module disabled); the snapshot is still fetched. */
  socket?: boolean;
  backoff?: Partial<BackoffOptions>;
  WebSocketImpl?: typeof WebSocket;
}

export function useSiteLive(siteId: string | undefined, options: UseSiteLiveOptions = {}) {
  const api = useApi();
  const client = useApiClient();
  const qc = useQueryClient();
  const [connection, setConnection] = useState<LiveConnection>({
    status: 'idle',
    downSince: null,
    lastEventAt: null,
  });
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const pending = useRef<EdgeEvent[]>([]);
  const socketEnabled = options.socket !== false && !!siteId;
  const { WebSocketImpl } = options;
  // Callers often pass an inline object; key the effect on its content.
  const backoffKey = JSON.stringify(options.backoff ?? {});

  const query = useQuery({
    queryKey: queryKeys.live(siteId ?? ''),
    queryFn: ({ signal }) => api.getLive(siteId!, signal),
    enabled: !!siteId,
    staleTime: 5_000,
    // Poll while the socket is down; the socket keeps the cache fresh otherwise.
    refetchInterval: connection.status === 'open' ? false : 15_000,
  });

  // Apply events that arrived before the first snapshot.
  useEffect(() => {
    if (!siteId || !query.data || pending.current.length === 0) return;
    const events = pending.current;
    pending.current = [];
    qc.setQueryData<LiveSnapshot>(queryKeys.live(siteId), (old) =>
      old ? events.reduce(applyEvent, old) : old,
    );
  }, [qc, siteId, query.data]);

  useEffect(() => {
    if (!socketEnabled || !siteId) return;
    const key = queryKeys.live(siteId);
    pending.current = [];
    const socket = new LiveSocket({
      getUrl: () => api.liveSocketUrl(siteId),
      refreshAuth: () => client.refresh(),
      backoff: JSON.parse(backoffKey) as Partial<BackoffOptions>,
      WebSocketImpl,
      onStatus: (status) =>
        setConnection((c) => ({
          ...c,
          status,
          downSince: status === 'open' ? null : (c.downSince ?? Date.now()),
        })),
      onOpen: (reconnected) => {
        if (reconnected) void qc.invalidateQueries({ queryKey: key });
      },
      onSnapshot: (snapshot) => {
        if (snapshot.site_id !== siteId) return;
        qc.setQueryData<LiveSnapshot>(key, snapshot);
        setConnection((c) => ({ ...c, lastEventAt: Date.now() }));
      },
      onEvent: (event) => {
        if (event.site_id !== siteId) return;
        const current = qc.getQueryData<LiveSnapshot>(key);
        if (current) qc.setQueryData<LiveSnapshot>(key, applyEvent(current, event));
        else pending.current.push(event);
        setConnection((c) => ({ ...c, lastEventAt: Date.now() }));
        onEventRef.current?.(event);
      },
    });
    socket.start();
    return () => socket.stop();
  }, [api, client, qc, siteId, socketEnabled, backoffKey, WebSocketImpl]);

  return { ...query, connection };
}
