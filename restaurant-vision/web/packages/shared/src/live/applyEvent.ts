// Pure reducer: merges one EdgeEvent into a LiveSnapshot (the cached `GET /sites/{id}/live`).
// Out-of-order events (edge outbox replays) never move state backwards.
import type { AlertView, DeviceStatus, EdgeEvent, LiveSnapshot, TableLive } from '../contracts';
import { DEVICE_OFFLINE_AFTER_S } from '../contracts';

function updateTable(
  tables: TableLive[],
  tableId: string | null,
  fn: (t: TableLive) => TableLive,
): TableLive[] {
  if (!tableId) return tables;
  let changed = false;
  const next = tables.map((t) => {
    if (t.table_id !== tableId) return t;
    const u = fn(t);
    if (u !== t) changed = true;
    return u;
  });
  return changed ? next : tables;
}

export function applyEvent(snapshot: LiveSnapshot, event: EdgeEvent): LiveSnapshot {
  if (event.site_id !== snapshot.site_id) return snapshot;

  switch (event.type) {
    case 'table.state_changed': {
      // `since_ts` (contracts 1.1) is when the state really began, backdated to the evidence;
      // 1.0 producers omit it, then the transition time stands in.
      const since = event.since_ts ?? event.ts;
      const tables = updateTable(snapshot.tables, event.table_id, (t) => {
        if (t.since_ts !== null && since < t.since_ts) return t; // stale
        return { ...t, state: event.to_state, guest_count: event.guest_count, since_ts: since };
      });
      return tables === snapshot.tables ? snapshot : { ...snapshot, tables };
    }

    case 'alert.raised': {
      if (snapshot.open_alerts.some((a) => a.alert_id === event.alert_id)) return snapshot;
      const table = snapshot.tables.find((t) => t.table_id === event.table_id);
      const alert: AlertView = {
        alert_id: event.alert_id,
        site_id: event.site_id,
        kind: event.kind,
        severity: event.severity,
        status: 'open',
        table_id: event.table_id,
        table_label: table?.label ?? null,
        zone_id: event.zone_id,
        raised_at: event.ts,
        acked_at: null,
        ack_via: null,
        resolved_at: null,
        resolve_reason: null,
        condition_since_ts: event.condition_since_ts ?? null,
      };
      const open_alerts = [...snapshot.open_alerts, alert].sort(
        (a, b) => a.raised_at - b.raised_at,
      );
      const tables = updateTable(snapshot.tables, event.table_id, (t) =>
        t.open_alert_ids.includes(event.alert_id)
          ? t
          : { ...t, open_alert_ids: [...t.open_alert_ids, event.alert_id] },
      );
      return { ...snapshot, open_alerts, tables };
    }

    case 'alert.acknowledged': {
      let changed = false;
      const open_alerts = snapshot.open_alerts.map((a) => {
        if (a.alert_id !== event.alert_id || a.status === 'acknowledged') return a;
        changed = true;
        return {
          ...a,
          status: 'acknowledged' as const,
          acked_at: event.ack_at,
          ack_via: event.via,
        };
      });
      return changed ? { ...snapshot, open_alerts } : snapshot;
    }

    case 'alert.resolved': {
      const alert = snapshot.open_alerts.find((a) => a.alert_id === event.alert_id);
      if (!alert) return snapshot;
      const open_alerts = snapshot.open_alerts.filter((a) => a.alert_id !== event.alert_id);
      const tables = snapshot.tables.map((t) =>
        t.open_alert_ids.includes(event.alert_id)
          ? { ...t, open_alert_ids: t.open_alert_ids.filter((id) => id !== event.alert_id) }
          : t,
      );
      return { ...snapshot, open_alerts, tables };
    }

    case 'queue.snapshot': {
      const existing = snapshot.queues.find((q) => q.zone_id === event.zone_id);
      if (existing && existing.ts > event.ts) return snapshot;
      const q = {
        zone_id: event.zone_id,
        ts: event.ts,
        people: event.people,
        parties_est: event.parties_est,
        longest_wait_s: event.longest_wait_s,
        avg_wait_s: event.avg_wait_s,
      };
      const queues = existing
        ? snapshot.queues.map((x) => (x.zone_id === event.zone_id ? q : x))
        : [...snapshot.queues, q];
      return { ...snapshot, queues };
    }

    case 'occupancy.snapshot': {
      if (snapshot.occupancy && snapshot.occupancy.ts > event.ts) return snapshot;
      return {
        ...snapshot,
        occupancy: {
          ts: event.ts,
          guests: event.guests,
          tables_occupied: event.tables_occupied,
          tables_total: event.tables_total,
          staff_on_floor: event.staff_on_floor,
        },
      };
    }

    case 'edge.heartbeat': {
      const existing = snapshot.devices.find((d) => d.device_id === event.device_id);
      if (existing?.last_seen_at && existing.last_seen_at > event.ts) return snapshot;
      const device: DeviceStatus = {
        device_id: event.device_id,
        version: event.version,
        last_seen_at: event.ts,
        online: true,
        cameras: event.cameras,
        cpu_pct: event.cpu_pct,
        mem_mb: event.mem_mb,
        outbox_depth: event.outbox_depth,
        local_url: event.local_url ?? null,
      };
      const devices = existing
        ? snapshot.devices.map((d) => (d.device_id === event.device_id ? device : d))
        : [...snapshot.devices, device];
      return { ...snapshot, devices };
    }

    // History-only events: they feed reports, not the live view.
    case 'table.session_closed':
    case 'queue.seated':
    case 'queue.walkaway':
      return snapshot;

    default:
      return snapshot;
  }
}

/** When the condition behind an alert began (e.g. guests seated): `condition_since_ts`,
 * falling back to `raised_at` (1.0 producers). */
export function alertSince(alert: Pick<AlertView, 'condition_since_ts' | 'raised_at'>): number {
  return alert.condition_since_ts ?? alert.raised_at;
}

/** Seconds the guests have been waiting at `nowS` (never negative, clock skew included). */
export function alertWaitingS(
  alert: Pick<AlertView, 'condition_since_ts' | 'raised_at'>,
  nowS: number,
): number {
  return Math.max(0, nowS - alertSince(alert));
}

/** A device counts as online when the cloud says so and its heartbeat is recent. */
export function isDeviceOnline(device: DeviceStatus, nowS: number): boolean {
  if (!device.online || device.last_seen_at === null) return false;
  return nowS - device.last_seen_at <= DEVICE_OFFLINE_AFTER_S;
}
