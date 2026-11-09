// Contract types generated from rv_contracts (schema.json -> types.ts) plus small runtime
// constants that mirror enums in the Python models. Keep the constants in sync by type:
// each list is checked against the generated union with `satisfies`.
export type * from './types';
export { CONTRACT_SCHEMA_VERSION } from './types';

import type {
  AlertKind,
  AlertSeverity,
  CameraStatus,
  Currency,
  EdgeEvent,
  EventType,
  LiveSnapshotMessage,
  Locale,
  Role,
  TableState,
  Thresholds,
  TimeseriesMetric,
  WsCloseCode,
} from './types';

export const TABLE_STATES = [
  'empty',
  'seated',
  'attended',
  'needs_bussing',
] as const satisfies readonly TableState[];

export const ALERT_KINDS = [
  'waiter_needed',
  'checkin_needed',
  'bussing_needed',
  'long_queue',
] as const satisfies readonly AlertKind[];

export const ALERT_SEVERITIES = [
  'info',
  'warn',
  'urgent',
] as const satisfies readonly AlertSeverity[];
export const CAMERA_STATUSES = [
  'ok',
  'degraded',
  'offline',
] as const satisfies readonly CameraStatus[];
export const CURRENCIES = ['ILS', 'USD', 'AUD'] as const satisfies readonly Currency[];
export const LOCALES = ['he', 'en'] as const satisfies readonly Locale[];
export const ROLES = ['owner', 'manager', 'waiter'] as const satisfies readonly Role[];

/** `GET /sites/{id}/metrics/timeseries?metric=` values (contracts 1.1 adds the last two). */
export const TIMESERIES_METRICS = [
  'occupancy',
  'queue',
  'walkaways',
  'response_time',
  'response_time_p90',
  'queue_wait',
] as const satisfies readonly TimeseriesMetric[];

export const EVENT_TYPES = [
  'table.state_changed',
  'table.session_closed',
  'alert.raised',
  'alert.acknowledged',
  'alert.resolved',
  'queue.snapshot',
  'queue.seated',
  'queue.walkaway',
  'occupancy.snapshot',
  'edge.heartbeat',
] as const satisfies readonly EventType[];

/** Contract defaults of `Thresholds` (architecture 5.1). */
export const DEFAULT_THRESHOLDS: Thresholds = {
  seat_confirm_s: 20,
  leave_confirm_s: 45,
  staff_visit_min_s: 5,
  first_visit_timeout_s: 180,
  checkin_timeout_s: 900,
  bussing_visit_min_s: 10,
  bussing_timeout_s: 300,
  walkaway_min_wait_s: 60,
  long_queue_people: 8,
  long_queue_wait_s: 600,
  count_window_s: 30,
  snapshot_interval_s: 10,
  track_id_ttl_h: 24,
};

/** Close codes of the cloud `WS /ws` when it refuses a connection (contracts `WsCloseCode`). */
export const WS_CLOSE_CODES = {
  /** Missing `token` or `site_id`. */
  badRequest: 4400,
  /** Bad or expired access token: refresh and reconnect. */
  unauthorized: 4401,
  /** No access to the site: stop reconnecting. */
  forbidden: 4403,
} as const satisfies Record<string, WsCloseCode>;

/** Seconds without a heartbeat before the cloud shows a device offline (rv_contracts). */
export const DEVICE_OFFLINE_AFTER_S = 90;

/** Event type -> concrete event shape. */
export type EdgeEventOf<T extends EventType> = Extract<EdgeEvent, { type: T }>;

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

/**
 * True for the `live.snapshot` message (generated `LiveSnapshotMessage`) that the edge's local
 * socket and the cloud socket (owners and managers, on connect) send alongside EdgeEvents.
 */
export function isLiveSnapshotMessage(value: unknown): value is LiveSnapshotMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const snap = v.snapshot as Record<string, unknown> | undefined;
  return (
    v.type === 'live.snapshot' &&
    typeof snap === 'object' &&
    snap !== null &&
    typeof snap.site_id === 'string' &&
    Array.isArray(snap.tables) &&
    Array.isArray(snap.open_alerts)
  );
}

/**
 * Cheap structural check for messages arriving over a WebSocket. Full validation happens on
 * the producer side (pydantic); here we only make sure the discriminator and ids exist.
 */
export function isEdgeEvent(value: unknown): value is EdgeEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === 'string' &&
    EVENT_TYPE_SET.has(v.type) &&
    typeof v.site_id === 'string' &&
    typeof v.ts === 'number'
  );
}
