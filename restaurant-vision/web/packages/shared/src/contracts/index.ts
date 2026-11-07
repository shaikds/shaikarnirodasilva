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
  Locale,
  Role,
  TableState,
  Thresholds,
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

export const ALERT_SEVERITIES = ['info', 'warn', 'urgent'] as const satisfies readonly AlertSeverity[];
export const CAMERA_STATUSES = ['ok', 'degraded', 'offline'] as const satisfies readonly CameraStatus[];
export const CURRENCIES = ['ILS', 'USD', 'AUD'] as const satisfies readonly Currency[];
export const LOCALES = ['he', 'en'] as const satisfies readonly Locale[];
export const ROLES = ['owner', 'manager', 'waiter'] as const satisfies readonly Role[];

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

/** Seconds without a heartbeat before the cloud shows a device offline (rv_contracts). */
export const DEVICE_OFFLINE_AFTER_S = 90;

/** Event type -> concrete event shape. */
export type EdgeEventOf<T extends EventType> = Extract<EdgeEvent, { type: T }>;

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

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
