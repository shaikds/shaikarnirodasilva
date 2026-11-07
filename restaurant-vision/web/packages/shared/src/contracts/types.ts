/* eslint-disable */
/**
 * Generated from src/contracts/schema.json by scripts/gen-types.mjs
 * (rv_contracts schema version 1.0). Do not edit by hand: run `pnpm gen:types`.
 */

/**
 * Where an acknowledgement was pressed. Never who pressed it.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AckVia".
 */
export type AckVia = 'cloud' | 'local';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertKind".
 */
export type AlertKind = 'waiter_needed' | 'checkin_needed' | 'bussing_needed' | 'long_queue';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertSeverity".
 */
export type AlertSeverity = 'info' | 'warn' | 'urgent';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "ResolveReason".
 */
export type ResolveReason = 'staff_visit' | 'state_change' | 'manual' | 'expired';
/**
 * Derived alert status. ``GET /alerts?status=open`` returns every unresolved alert
 * (``open`` and ``acknowledged``).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertStatus".
 */
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
/**
 * Which point of a person's box is tested against zones.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Anchor".
 */
export type Anchor = 'foot' | 'center';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Currency".
 */
export type Currency = 'ILS' | 'USD' | 'AUD';
/**
 * Time-series bucket width. ``1d`` buckets follow the site's local midnight.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Bucket".
 */
export type Bucket = '5m' | '15m' | '1h' | '1d';
/**
 * Where frames come from. Connection details (URLs, credentials) stay on the edge.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CameraSource".
 */
export type CameraSource = 'rtsp' | 'file' | 'simulated';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CameraStatus".
 */
export type CameraStatus = 'ok' | 'degraded' | 'offline';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CommandKind".
 */
export type CommandKind = 'alert_ack' | 'config_changed';
/**
 * Result of :func:`line_crossing`.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Crossing".
 */
export type Crossing = 'in' | 'out';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "EdgeCommand".
 */
export type EdgeCommand = AlertAckCommand | ConfigChangedCommand;
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "EdgeEvent".
 */
export type EdgeEvent =
  | TableStateChanged
  | TableSessionClosed
  | AlertRaised
  | AlertAcknowledged
  | AlertResolved
  | QueueSnapshot
  | QueueSeated
  | QueueWalkaway
  | OccupancySnapshot
  | EdgeHeartbeat;
/**
 * Table state machine states (architecture 6.2).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TableState".
 */
export type TableState = 'empty' | 'seated' | 'attended' | 'needs_bussing';
/**
 * Value of the ``type`` discriminator of every :data:`EdgeEvent`.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "EventType".
 */
export type EventType =
  | 'table.state_changed'
  | 'table.session_closed'
  | 'alert.raised'
  | 'alert.acknowledged'
  | 'alert.resolved'
  | 'queue.snapshot'
  | 'queue.seated'
  | 'queue.walkaway'
  | 'occupancy.snapshot'
  | 'edge.heartbeat';
/**
 * Which crossing of a directed line ``a -> b`` counts as inward (see module docstring).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "LineDirection".
 */
export type LineDirection = 'left_to_right' | 'right_to_left';
/**
 * UI and report language. Hebrew is right-to-left.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = 'he' | 'en';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Plan".
 */
export type Plan = 'starter' | 'pro';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Role".
 */
export type Role = 'owner' | 'manager' | 'waiter';
/**
 * What a zone means to the analytics (architecture 6.2).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "ZoneKind".
 */
export type ZoneKind = 'table' | 'queue' | 'entrance_line' | 'staff_area' | 'area' | 'privacy';
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TimeseriesMetric".
 */
export type TimeseriesMetric = 'occupancy' | 'queue' | 'walkaways' | 'response_time';

/**
 * Restaurant Vision contracts, schema version 1.0. Generated by rv_contracts.schema_export; do not edit.
 */
export interface RvContracts {
  AckVia: AckVia;
  AlertAckCommand: AlertAckCommand;
  AlertAcknowledged: AlertAcknowledged;
  AlertKind: AlertKind;
  AlertRaised: AlertRaised;
  AlertResolved: AlertResolved;
  AlertSeverity: AlertSeverity;
  AlertStatus: AlertStatus;
  AlertView: AlertView;
  Anchor: Anchor;
  BranchComparison: BranchComparison;
  Bucket: Bucket;
  CameraConfig: CameraConfig;
  CameraHealth: CameraHealth;
  CameraSource: CameraSource;
  CameraStatus: CameraStatus;
  CommandKind: CommandKind;
  CommandsPage: CommandsPage;
  ConfigChangedCommand: ConfigChangedCommand;
  CoverageReport: CoverageReport;
  Crossing: Crossing;
  Currency: Currency;
  DeviceStatus: DeviceStatus;
  EdgeCommand: EdgeCommand;
  EdgeEvent: EdgeEvent;
  EdgeHeartbeat: EdgeHeartbeat;
  Estimate: Estimate;
  EventBatch: EventBatch;
  EventType: EventType;
  EventsAccepted: EventsAccepted;
  FloorPlanItem: FloorPlanItem;
  HealthStatus: HealthStatus;
  Line: Line;
  LineDirection: LineDirection;
  LiveSnapshot: LiveSnapshot;
  Locale: Locale;
  LoginRequest: LoginRequest;
  Me: Me;
  MembershipInfo: MembershipInfo;
  MetricsSummary: MetricsSummary;
  Modules: Modules;
  OccupancyLive: OccupancyLive;
  OccupancySnapshot: OccupancySnapshot;
  OrgInfo: OrgInfo;
  OrgUser: OrgUser;
  PairRequest: PairRequest;
  PairResponse: PairResponse;
  PairingCodeInfo: PairingCodeInfo;
  Plan: Plan;
  PushKeys: PushKeys;
  PushSubscriptionIn: PushSubscriptionIn;
  PushSubscriptionOut: PushSubscriptionOut;
  QueueLive: QueueLive;
  QueueSeated: QueueSeated;
  QueueSnapshot: QueueSnapshot;
  QueueWalkaway: QueueWalkaway;
  RefreshRequest: RefreshRequest;
  ResolveReason: ResolveReason;
  RoiBlock: RoiBlock;
  Role: Role;
  ShiftReport: ShiftReport;
  SignupRequest: SignupRequest;
  SiteConfig: SiteConfig;
  SiteCreate: SiteCreate;
  SiteRef: SiteRef;
  SiteSettings: SiteSettings;
  SiteSettingsPatch: SiteSettingsPatch;
  SiteSummary: SiteSummary;
  Table: Table;
  TableLive: TableLive;
  TableSessionClosed: TableSessionClosed;
  TableState: TableState;
  TableStateChanged: TableStateChanged;
  TableStats: TableStats;
  Thresholds: Thresholds;
  Timeseries: Timeseries;
  TimeseriesMetric: TimeseriesMetric;
  TimeseriesPoint: TimeseriesPoint;
  TokenPair: TokenPair;
  UserCreate: UserCreate;
  UserInfo: UserInfo;
  UserUpdate: UserUpdate;
  VapidPublicKey: VapidPublicKey;
  Zone: Zone;
  ZoneKind: ZoneKind;
}
/**
 * An alert was acknowledged in the cloud (waiter app). The edge applies it and emits
 * ``alert.acknowledged`` with ``via="cloud"`` and this ``ack_at``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertAckCommand".
 */
export interface AlertAckCommand {
  kind: 'alert_ack';
  command_id: string;
  site_id: string;
  created_at: number;
  alert_id: string;
  ack_at: number;
}
/**
 * Someone pressed "on it". No user identity, by design.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertAcknowledged".
 */
export interface AlertAcknowledged {
  type: 'alert.acknowledged';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  alert_id: string;
  /**
   * When the button was pressed (for cloud acks: the cloud's receive time).
   */
  ack_at: number;
  via: AckVia;
}
/**
 * A new alert. Table alerts carry ``table_id``; ``long_queue`` carries ``zone_id``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertRaised".
 */
export interface AlertRaised {
  type: 'alert.raised';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  alert_id: string;
  kind: AlertKind;
  table_id: string | null;
  zone_id: string | null;
  severity: AlertSeverity;
}
/**
 * An alert closed.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertResolved".
 */
export interface AlertResolved {
  type: 'alert.resolved';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  alert_id: string;
  resolved_at: number;
  reason: ResolveReason;
}
/**
 * An alert as shown to staff. Acks carry time and channel only, never a person.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "AlertView".
 */
export interface AlertView {
  alert_id: string;
  site_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  table_id: string | null;
  /**
   * Label of ``table_id`` for display.
   */
  table_label: string | null;
  zone_id: string | null;
  raised_at: number;
  acked_at: number | null;
  ack_via: AckVia | null;
  resolved_at: number | null;
  resolve_reason: ResolveReason | null;
}
/**
 * ``GET /orgs/{org_id}/reports/compare`` (owners): one summary per site.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "BranchComparison".
 */
export interface BranchComparison {
  org_id: string;
  from_ts: number;
  to_ts: number;
  sites: MetricsSummary[];
}
/**
 * KPIs of one site over ``[from_ts, to_ts)``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "MetricsSummary".
 */
export interface MetricsSummary {
  site_id: string;
  from_ts: number;
  to_ts: number;
  currency: Currency;
  /**
   * Table sessions closed in the range.
   */
  sessions: number;
  /**
   * Sum of ``max_guests`` over those sessions.
   */
  guests_served: number;
  avg_dwell_s: number | null;
  /**
   * Sessions per table (sessions / number of tables).
   */
  turnover_per_table: number | null;
  /**
   * ``waiter_needed`` raised -> resolved, median.
   */
  waiter_response_p50_s: number | null;
  waiter_response_p90_s: number | null;
  bussing_delay_p50_s: number | null;
  /**
   * Mean ``waited_s`` of ``queue.seated``.
   */
  queue_avg_wait_s: number | null;
  queue_max_wait_s: number | null;
  walkaways: number;
  /**
   * walkaways x party_size_est x avg_check_per_guest.
   */
  lost_revenue: Estimate;
}
/**
 * A derived figure that the UI must label as an estimate.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Estimate".
 */
export interface Estimate {
  /**
   * None when there is not enough data.
   */
  value: number | null;
  is_estimate: true;
}
/**
 * One camera as the analytics sees it. No URL or credentials (see module docstring).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CameraConfig".
 */
export interface CameraConfig {
  camera_id: string;
  /**
   * Display name, e.g. "Dining room".
   */
  name: string;
  source: CameraSource;
  /**
   * Point of each person box tested against zones.
   */
  anchor: Anchor;
  /**
   * Frames per second analysed; the source drops frames down to this rate.
   */
  target_fps: number;
  /**
   * Polygons blacked out before detection (merged with ``privacy`` zones).
   */
  privacy_masks: [number, number][][];
  enabled: boolean;
}
/**
 * Per-camera health inside ``edge.heartbeat``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CameraHealth".
 */
export interface CameraHealth {
  camera_id: string;
  status: CameraStatus;
  /**
   * Frames per second actually analysed.
   */
  fps: number;
  /**
   * Seconds since the last frame; None if no frame since the edge started.
   */
  last_frame_age_s: number | null;
}
/**
 * ``GET /edge/commands?after=<cursor>``: commands created after ``after``, oldest first.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CommandsPage".
 */
export interface CommandsPage {
  /**
   * Opaque; send as ``after`` on the next poll. Unchanged when there is nothing new.
   */
  cursor: string;
  commands: (AlertAckCommand | ConfigChangedCommand)[];
}
/**
 * The site config changed in the cloud; the edge re-fetches ``GET /edge/config``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "ConfigChangedCommand".
 */
export interface ConfigChangedCommand {
  kind: 'config_changed';
  command_id: string;
  site_id: string;
  created_at: number;
  config_version: number;
}
/**
 * Edge ``GET /local/coverage``: tables no camera counts (``SiteConfig.coverage()``).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "CoverageReport".
 */
export interface CoverageReport {
  site_id: string;
  uncovered_table_ids: string[];
}
/**
 * An edge device and its latest heartbeat (None fields: no heartbeat yet).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "DeviceStatus".
 */
export interface DeviceStatus {
  device_id: string;
  version: string | null;
  last_seen_at: number | null;
  /**
   * Heartbeat within ``DEVICE_OFFLINE_AFTER_S``.
   */
  online: boolean;
  cameras: CameraHealth[];
  cpu_pct: number | null;
  mem_mb: number | null;
  outbox_depth: number | null;
}
/**
 * A table moved to another state.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TableStateChanged".
 */
export interface TableStateChanged {
  type: 'table.state_changed';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  table_id: string;
  from_state: TableState;
  to_state: TableState;
  /**
   * Smoothed number of guests at the table at transition time.
   */
  guest_count: number;
  /**
   * The seating this transition belongs to (see module docstring).
   */
  session_id: string;
}
/**
 * A seating ended (guests left). Emitted once per session.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TableSessionClosed".
 */
export interface TableSessionClosed {
  type: 'table.session_closed';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  table_id: string;
  session_id: string;
  seated_at: number;
  /**
   * When guests left (start of ``needs_bussing``). Dwell = ``left_at - seated_at``.
   */
  left_at: number;
  max_guests: number;
  /**
   * Seconds from ``seated_at`` to the first staff visit; None if never visited.
   */
  first_visit_delay_s: number | null;
  /**
   * Number of staff visits during the session.
   */
  visits: number;
  /**
   * Seconds from ``left_at`` to bussed; None if not known when the session closed.
   */
  bussing_delay_s: number | null;
}
/**
 * Queue zone state, every ``snapshot_interval_s``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "QueueSnapshot".
 */
export interface QueueSnapshot {
  type: 'queue.snapshot';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  zone_id: string;
  people: number;
  /**
   * Estimated number of parties (tracks entering within 5 s and close together).
   */
  parties_est: number;
  longest_wait_s: number;
  /**
   * Mean current wait of people in the queue (0 when empty).
   */
  avg_wait_s: number;
}
/**
 * A queued person crossed the entrance line inward.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "QueueSeated".
 */
export interface QueueSeated {
  type: 'queue.seated';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  /**
   * The queue zone they waited in.
   */
  zone_id: string;
  waited_s: number;
}
/**
 * A party left the queue outward after ``walkaway_min_wait_s`` without being seated.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "QueueWalkaway".
 */
export interface QueueWalkaway {
  type: 'queue.walkaway';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  zone_id: string;
  waited_s: number;
  party_size_est: number;
}
/**
 * Site-wide occupancy, every ``snapshot_interval_s``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "OccupancySnapshot".
 */
export interface OccupancySnapshot {
  type: 'occupancy.snapshot';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  /**
   * Guests at tables plus guests in ``area`` zones.
   */
  guests: number;
  /**
   * Tables in ``seated`` or ``attended``.
   */
  tables_occupied: number;
  tables_total: number;
  staff_on_floor: number;
}
/**
 * Edge device health, every ``HEARTBEAT_INTERVAL_S``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "EdgeHeartbeat".
 */
export interface EdgeHeartbeat {
  type: 'edge.heartbeat';
  /**
   * UUIDv7 string; idempotency key.
   */
  event_id: string;
  site_id: string;
  /**
   * When it happened, Unix epoch seconds (UTC) on the edge clock.
   */
  ts: number;
  schema_version: string;
  device_id: string;
  /**
   * rv_edge version string.
   */
  version: string;
  cameras: CameraHealth[];
  /**
   * Process CPU usage in percent of one core (may exceed 100 on multi-core).
   */
  cpu_pct: number;
  /**
   * Process resident memory in MiB.
   */
  mem_mb: number;
  /**
   * Events persisted but not yet delivered to the cloud.
   */
  outbox_depth: number;
}
/**
 * Body of ``POST /api/v1/edge/events``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "EventBatch".
 */
export interface EventBatch {
  /**
   * @maxItems 500
   */
  events: (
    | TableStateChanged
    | TableSessionClosed
    | AlertRaised
    | AlertAcknowledged
    | AlertResolved
    | QueueSnapshot
    | QueueSeated
    | QueueWalkaway
    | OccupancySnapshot
    | EdgeHeartbeat
  )[];
}
/**
 * Response of ``POST /edge/events``. ``accepted + duplicates`` = batch size.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "EventsAccepted".
 */
export interface EventsAccepted {
  /**
   * Newly stored events.
   */
  accepted: number;
  /**
   * Events whose ``event_id`` was already stored (ignored, still a success).
   */
  duplicates: number;
}
/**
 * Position of a table on the dashboard's schematic floor-plan grid (not camera space).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "FloorPlanItem".
 */
export interface FloorPlanItem {
  table_id: string;
  /**
   * Grid column, 0-based, from the start edge (right in RTL).
   */
  x: number;
  /**
   * Grid row, 0-based, from the top.
   */
  y: number;
  /**
   * Width in grid cells.
   */
  w: number;
  /**
   * Height in grid cells.
   */
  h: number;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "HealthStatus".
 */
export interface HealthStatus {
  status: 'ok';
  version: string;
}
/**
 * Directed counting line ``a -> b`` (e.g. the entrance into the dining room).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Line".
 */
export interface Line {
  /**
   * Start point.
   *
   * @minItems 2
   * @maxItems 2
   */
  a: [number, number];
  /**
   * End point; must differ from ``a``.
   *
   * @minItems 2
   * @maxItems 2
   */
  b: [number, number];
  /**
   * Which crossing is inward: ``left_to_right`` makes the right-hand side of ``a -> b``
   * (as seen on screen) the inside.
   */
  in_direction: LineDirection;
}
/**
 * Live state of one site.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "LiveSnapshot".
 */
export interface LiveSnapshot {
  site_id: string;
  /**
   * When this snapshot was assembled.
   */
  ts: number;
  tables: TableLive[];
  occupancy: OccupancyLive | null;
  queues: QueueLive[];
  /**
   * Unresolved alerts, oldest first.
   */
  open_alerts: AlertView[];
  devices: DeviceStatus[];
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TableLive".
 */
export interface TableLive {
  table_id: string;
  label: string;
  seats: number;
  state: TableState;
  guest_count: number;
  /**
   * When the current state started; None if unknown (no event yet).
   */
  since_ts: number | null;
  open_alert_ids: string[];
}
/**
 * Latest ``occupancy.snapshot``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "OccupancyLive".
 */
export interface OccupancyLive {
  ts: number;
  guests: number;
  tables_occupied: number;
  tables_total: number;
  staff_on_floor: number;
}
/**
 * Latest ``queue.snapshot`` of one queue zone.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "QueueLive".
 */
export interface QueueLive {
  zone_id: string;
  ts: number;
  people: number;
  parties_est: number;
  longest_wait_s: number;
  avg_wait_s: number;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "LoginRequest".
 */
export interface LoginRequest {
  email: string;
  password: string;
}
/**
 * ``GET /me``: the signed-in user, their org, roles and the sites they can open.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Me".
 */
export interface Me {
  user: UserInfo;
  org: OrgInfo;
  memberships: MembershipInfo[];
  /**
   * Sites this user can access (all org sites for owners).
   */
  sites: SiteRef[];
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "UserInfo".
 */
export interface UserInfo {
  user_id: string;
  email: string;
  name: string;
  locale: Locale;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "OrgInfo".
 */
export interface OrgInfo {
  org_id: string;
  name: string;
  plan: Plan;
}
/**
 * A role grant. Owners have ``site_id=None`` (all sites); managers and waiters one site.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "MembershipInfo".
 */
export interface MembershipInfo {
  role: Role;
  site_id: string | null;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SiteRef".
 */
export interface SiteRef {
  site_id: string;
  name: string;
}
/**
 * Analytics modules enabled for the site (plans gate them; see architecture 4).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Modules".
 */
export interface Modules {
  occupancy: boolean;
  queue: boolean;
  tables: boolean;
  alerts: boolean;
}
/**
 * A user as listed in user management.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "OrgUser".
 */
export interface OrgUser {
  user_id: string;
  email: string;
  name: string;
  locale: Locale;
  memberships: MembershipInfo[];
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "PairRequest".
 */
export interface PairRequest {
  code: string;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "PairResponse".
 */
export interface PairResponse {
  device_id: string;
  site_id: string;
  /**
   * Device bearer token; stored only in the edge's local secrets file.
   */
  token: string;
}
/**
 * A one-time code shown in the dashboard and typed into ``rv-edge pair``.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "PairingCodeInfo".
 */
export interface PairingCodeInfo {
  /**
   * 6 characters, ``A-Z`` and ``0-9``.
   */
  code: string;
  site_id: string;
  expires_at: number;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "PushKeys".
 */
export interface PushKeys {
  p256dh: string;
  auth: string;
}
/**
 * ``POST /push/subscriptions``. From the browser's ``PushSubscription.toJSON()``:
 * ``endpoint`` and ``keys``; ``expirationTime`` is not used.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "PushSubscriptionIn".
 */
export interface PushSubscriptionIn {
  site_id: string;
  endpoint: string;
  keys: PushKeys;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "PushSubscriptionOut".
 */
export interface PushSubscriptionOut {
  subscription_id: string;
  site_id: string;
  endpoint: string;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "RefreshRequest".
 */
export interface RefreshRequest {
  refresh_token: string;
}
/**
 * ROI figures (architecture 7.4). Everything here is an estimate.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "RoiBlock".
 */
export interface RoiBlock {
  is_estimate: true;
  currency: Currency;
  avg_check_per_guest: number;
  walkaways: number;
  /**
   * walkaways x party_size_est x avg_check_per_guest.
   */
  lost_revenue: Estimate;
  /**
   * ``waiter_needed`` p50 over the first 7 days after install.
   */
  response_time_baseline_p50_s: number | null;
  response_time_current_p50_s: number | null;
  /**
   * baseline p50 - current p50.
   */
  response_time_improvement_s: Estimate;
  /**
   * Extra guests from faster turns, counted only in hours with a non-empty queue.
   */
  extra_covers: Estimate;
  /**
   * extra_covers x avg_check_per_guest.
   */
  extra_revenue: Estimate;
}
/**
 * ``GET /sites/{site_id}/reports/shift?date=YYYY-MM-DD``: one site-local calendar day.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "ShiftReport".
 */
export interface ShiftReport {
  site_id: string;
  date: string;
  timezone: string;
  from_ts: number;
  to_ts: number;
  summary: MetricsSummary;
  tables: TableStats[];
  occupancy_by_hour: TimeseriesPoint[];
  roi: RoiBlock;
}
/**
 * Per-table statistics over a range.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TableStats".
 */
export interface TableStats {
  table_id: string;
  label: string;
  seats: number;
  sessions: number;
  /**
   * Sum of ``max_guests``.
   */
  guests: number;
  avg_dwell_s: number | null;
  avg_party_size: number | null;
  first_visit_delay_p50_s: number | null;
  bussing_delay_p50_s: number | null;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TimeseriesPoint".
 */
export interface TimeseriesPoint {
  /**
   * Bucket start.
   */
  ts: number;
  /**
   * None when the bucket has no data.
   */
  value: number | null;
}
/**
 * Creates an organization and its owner.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SignupRequest".
 */
export interface SignupRequest {
  org_name: string;
  /**
   * Owner's display name.
   */
  name: string;
  email: string;
  password: string;
  locale: Locale;
}
/**
 * Everything the edge needs to run analytics for one site.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SiteConfig".
 */
export interface SiteConfig {
  schema_version: string;
  site_id: string;
  timezone: string;
  locale: Locale;
  cameras: CameraConfig[];
  tables: Table[];
  zones: Zone[];
  thresholds: Thresholds;
  modules: Modules;
  /**
   * Incremented by the cloud on every save; used as ETag. 0 = never saved.
   */
  config_version: number;
}
/**
 * A physical table. ``table_id`` is stable; ``label`` is what staff call it.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Table".
 */
export interface Table {
  table_id: string;
  /**
   * Shown to staff, e.g. "12" or "Window 3".
   */
  label: string;
  seats: number;
  /**
   * Optional floor section, e.g. "Patio".
   */
  section: string | null;
}
/**
 * A polygon or line on one camera image (normalized coordinates).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Zone".
 */
export interface Zone {
  zone_id: string;
  camera_id: string;
  kind: ZoneKind;
  /**
   * Required for every kind except ``entrance_line``; must be None for ``entrance_line``.
   */
  polygon: [number, number][] | null;
  /**
   * Required for ``entrance_line``; must be None otherwise.
   */
  line: Line | null;
  /**
   * Required for ``table`` zones; must be None otherwise.
   */
  table_id: string | null;
  /**
   * ``table`` zones only: this camera is the one that counts the table.
   */
  primary: boolean;
}
/**
 * Per-site analytics timing (architecture 5.1/6.2). Seconds unless the name says otherwise.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Thresholds".
 */
export interface Thresholds {
  /**
   * Guests continuously present this long: ``empty -> seated`` (opens a session).
   */
  seat_confirm_s: number;
  /**
   * No guests this long: ``seated|attended -> needs_bussing`` (closes the session).
   */
  leave_confirm_s: number;
  /**
   * Staff track in a table zone this long counts as a visit.
   */
  staff_visit_min_s: number;
  /**
   * ``seated`` without a visit this long raises ``waiter_needed``.
   */
  first_visit_timeout_s: number;
  /**
   * ``attended`` without a visit this long raises ``checkin_needed``.
   */
  checkin_timeout_s: number;
  /**
   * Staff visit this long during ``needs_bussing``: table is bussed (``-> empty``).
   */
  bussing_visit_min_s: number;
  /**
   * ``needs_bussing`` this long raises ``bussing_needed``.
   */
  bussing_timeout_s: number;
  /**
   * Queue tracks leaving outward after waiting at least this long count as walk-aways.
   */
  walkaway_min_wait_s: number;
  /**
   * People in a queue zone at or above which ``long_queue`` is raised.
   */
  long_queue_people: number;
  /**
   * Longest queue wait at or above which ``long_queue`` is raised.
   */
  long_queue_wait_s: number;
  /**
   * Rolling-median window for smoothing guest counts.
   */
  count_window_s: number;
  /**
   * Interval of ``queue.snapshot`` / ``occupancy.snapshot`` events.
   */
  snapshot_interval_s: number;
  /**
   * Hours before track id mappings rotate. At most 24 (privacy: rotated at least daily).
   */
  track_id_ttl_h: number;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SiteCreate".
 */
export interface SiteCreate {
  name: string;
  timezone: string;
  locale: Locale;
  currency: Currency;
  avg_check_per_guest: number;
}
/**
 * ``GET /sites/{site_id}``. Thresholds and modules are also part of ``SiteConfig``;
 * changing them here bumps ``config_version`` and notifies the edge (``config_changed``).
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SiteSettings".
 */
export interface SiteSettings {
  site_id: string;
  org_id: string;
  name: string;
  timezone: string;
  locale: Locale;
  currency: Currency;
  /**
   * Average spend per guest, used for ROI estimates.
   */
  avg_check_per_guest: number;
  thresholds: Thresholds;
  modules: Modules;
  floor_plan: FloorPlanItem[];
}
/**
 * ``PATCH /sites/{site_id}``: omitted fields are unchanged; nested objects are replaced.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SiteSettingsPatch".
 */
export interface SiteSettingsPatch {
  name?: string | null;
  timezone?: string | null;
  locale?: Locale | null;
  currency?: Currency | null;
  avg_check_per_guest?: number | null;
  thresholds?: Thresholds | null;
  modules?: Modules | null;
  floor_plan?: FloorPlanItem[] | null;
}
/**
 * A site card in the org overview.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "SiteSummary".
 */
export interface SiteSummary {
  site_id: string;
  org_id: string;
  name: string;
  timezone: string;
  locale: Locale;
  currency: Currency;
  /**
   * Guests now (latest occupancy snapshot); None if no data yet.
   */
  guests: number | null;
  /**
   * Unresolved alerts.
   */
  open_alerts: number;
  /**
   * At least one device sent a heartbeat within ``DEVICE_OFFLINE_AFTER_S``.
   */
  edge_online: boolean;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "Timeseries".
 */
export interface Timeseries {
  site_id: string;
  metric: TimeseriesMetric;
  bucket: Bucket;
  from_ts: number;
  to_ts: number;
  /**
   * One point per bucket in range, ascending.
   */
  points: TimeseriesPoint[];
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "TokenPair".
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  /**
   * Access token lifetime in seconds.
   */
  expires_in: number;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "UserCreate".
 */
export interface UserCreate {
  email: string;
  name: string;
  /**
   * Initial password, changed by the user later.
   */
  password: string;
  locale: Locale;
  /**
   * @minItems 1
   */
  memberships: [MembershipInfo, ...MembershipInfo[]];
}
/**
 * Partial update; omitted fields are unchanged.
 *
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "UserUpdate".
 */
export interface UserUpdate {
  name?: string | null;
  locale?: Locale | null;
  password?: string | null;
  /**
   * Replaces all memberships when given.
   */
  memberships?: MembershipInfo[] | null;
}
/**
 * This interface was referenced by `RvContracts`'s JSON-Schema
 * via the `definition` "VapidPublicKey".
 */
export interface VapidPublicKey {
  /**
   * URL-safe base64 VAPID application server key.
   */
  public_key: string;
}

/** Contract schema version these types were generated from. */
export const CONTRACT_SCHEMA_VERSION = '1.0';
