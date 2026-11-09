// useSiteLive(siteId): initial `GET /sites/{id}/live`, then `WS /api/v1/ws?token=&site_id=`
// with reconnect + backoff. Every event is merged into the React Query cache; on reconnect
// the snapshot is refetched to recover anything missed. The cloud sends owners and managers a
// `live.snapshot` right after connecting, which replaces the cache (`onSnapshot`).
//
// `alertsOnly` (the waiter app): waiters may not read `/live` and their socket carries
// `alert.*` events only, so the cached snapshot is built from `GET /sites/{id}/alerts` (open
// alerts, with table labels) and holds no tables, queues or devices.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApi, useApiClient } from '../api/provider';
import { queryKeys } from '../api/queryKeys';
import type { AlertView, EdgeEvent, LiveSnapshot } from '../contracts';
import { applyEvent, latestEdgeTs } from './applyEvent';
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
  /** Waiter view: open alerts only, from `GET /sites/{id}/alerts` instead of `/live`. */
  alertsOnly?: boolean;
  backoff?: Partial<BackoffOptions>;
  WebSocketImpl?: typeof WebSocket;
}

function knownLabel(snapshot: LiveSnapshot, tableId: string): string | null {
  return (
    snapshot.tables.find((t) => t.table_id === tableId)?.label ??
    snapshot.open_alerts.find((a) => a.table_id === tableId && a.table_label !== null)
      ?.table_label ??
    null
  );
}

function withLabel(snapshot: LiveSnapshot, alertId: string, label: string): LiveSnapshot {
  return {
    ...snapshot,
    open_alerts: snapshot.open_alerts.map((a) =>
      a.alert_id === alertId && a.table_label === null ? { ...a, table_label: label } : a,
    ),
  };
}

/** A LiveSnapshot that carries open alerts only (waiter view). */
export function alertsSnapshot(siteId: string, openAlerts: AlertView[]): LiveSnapshot {
  return {
    site_id: siteId,
    ts: Date.now() / 1000,
    tables: [],
    occupancy: null,
    queues: [],
    open_alerts: openAlerts,
    devices: [],
  };
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
  // Seconds the site's event clock runs ahead of this browser, never negative: ~0 in
  // production; positive when the edge clock is fast, or for a sped-up simulated edge
  // (`rv-edge simulate --speed 20`), whose events carry simulated time. Timers that compare
  // event times with "now" (table timers, "guests waiting") add it to the wall clock. Each new
  // sample replaces the last, so one odd timestamp cannot skew the clock for long.
  const [clockOffsetS, setClockOffsetS] = useState(0);
  const noteEdgeTs = useRef((ts: number | null) => {
    if (ts === null) return;
    const ahead = Math.max(0, ts - Date.now() / 1000);
    setClockOffsetS((o) => (Math.abs(ahead - o) < 0.5 ? o : ahead));
  });
  const socketEnabled = options.socket !== false && !!siteId;
  const { WebSocketImpl } = options;
  const alertsOnly = options.alertsOnly === true;
  // Callers often pass an inline object; key the effect on its content.
  const backoffKey = JSON.stringify(options.backoff ?? {});

  const query = useQuery({
    queryKey: queryKeys.live(siteId ?? ''),
    queryFn: ({ signal }) =>
      alertsOnly
        ? api
            .listAlerts(siteId!, { status: 'open' }, signal)
            .then((open_alerts) => alertsSnapshot(siteId!, open_alerts))
        : api.getLive(siteId!, signal),
    enabled: !!siteId,
    staleTime: 5_000,
    // Poll while the socket is down; the socket keeps the cache fresh otherwise.
    refetchInterval: connection.status === 'open' ? false : 15_000,
  });

  useEffect(() => {
    if (query.data) noteEdgeTs.current(latestEdgeTs(query.data));
  }, [query.data]);

  // Apply events that arrived before the first snapshot.
  useEffect(() => {
    if (!siteId || !query.data || pending.current.length === 0) return;
    const events = pending.current;
    pending.current = [];
    qc.setQueryData<LiveSnapshot>(queryKeys.live(siteId), (old) =>
      old ? events.reduce((s, e) => applyEvent(s, e, Date.now() / 1000), old) : old,
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
        if (event.type !== 'alert.acknowledged' || event.via === 'local')
          noteEdgeTs.current(event.ts);
        const current = qc.getQueryData<LiveSnapshot>(key);
        if (alertsOnly && event.type === 'alert.raised' && event.table_id !== null) {
          // No tables in the waiter cache, so no table label for a new alert: use one seen on
          // an earlier alert of that table, else wait for `/alerts` to bring the labelled alert
          // (so it never shows up, or gets announced, without its table).
          const label = current ? knownLabel(current, event.table_id) : null;
          if (current && label !== null) {
            qc.setQueryData<LiveSnapshot>(
              key,
              withLabel(applyEvent(current, event, Date.now() / 1000), event.alert_id, label),
            );
          } else {
            void qc.invalidateQueries({ queryKey: key });
          }
        } else if (current) {
          qc.setQueryData<LiveSnapshot>(key, applyEvent(current, event, Date.now() / 1000));
        } else {
          pending.current.push(event);
        }
        setConnection((c) => ({ ...c, lastEventAt: Date.now() }));
        onEventRef.current?.(event);
      },
    });
    socket.start();
    return () => socket.stop();
  }, [api, client, qc, siteId, socketEnabled, backoffKey, WebSocketImpl, alertsOnly]);

  return { ...query, connection, clockOffsetS };
}
