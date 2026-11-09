// Shapes of the edge LAN API models that are local to `rv_edge/runtime/local_api.py` (not part
// of rv_contracts, so not in the generated types). Keep in sync with that file.
import type { CameraStatus } from '@rv/shared';

/** `GET /local/setup/status` */
export interface SetupStatus {
  version: string;
  pin_set: boolean;
  paired: boolean;
  site_id: string | null;
  device_id: string | null;
  cloud_url: string | null;
  cloud_online: boolean;
  last_sync_error: string | null;
  configured: boolean;
  config_version: number;
  pending_config_push: boolean;
  outbox_depth: number;
  /** Cameras the edge can open (stored ones, plus simulated ones in `rv-edge simulate`). */
  camera_count: number;
  /** A staff uniform colour was calibrated (`POST /local/uniform/calibrate`). */
  uniform_calibrated: boolean;
}

export type OptionValue = string | number | boolean;

/** `POST /local/cameras` body. `username`/`password` are merged into the URL server-side. */
export interface CameraIn {
  camera_id: string;
  kind?: 'rtsp' | 'file';
  url: string;
  username?: string | null;
  password?: string | null;
  loop?: boolean;
  options?: Record<string, OptionValue>;
}

/** `PUT /local/cameras/{id}` body. Omit `url` to keep the stored one (and its credentials). */
export interface CameraUpdate {
  kind?: 'rtsp' | 'file' | null;
  url?: string | null;
  username?: string | null;
  password?: string | null;
  loop?: boolean | null;
  options?: Record<string, OptionValue> | null;
}

/** Camera kinds the edge lists; `simulated` ones (`rv-edge simulate`) are read-only. */
export type CameraKind = 'rtsp' | 'file' | 'simulated';

/**
 * A camera as the edge lists it. `url` is always redacted (`rtsp://***@host/...`; simulated
 * cameras: `simulated://<id>`). The address parts are non-secret: from the options the wizard
 * stored, else matched against the brand templates; null when unknown (custom path, file or
 * simulated source).
 */
export interface CameraOut {
  camera_id: string;
  kind: CameraKind | (string & {});
  url: string;
  has_credentials: boolean;
  loop: boolean;
  /** Brand key (`hikvision`, `dahua`, ...), see lib/rtsp BRANDS. */
  brand: string | null;
  host: string | null;
  port: number | null;
  channel: number | null;
  substream: boolean | null;
  in_config: boolean;
  name: string | null;
  enabled: boolean | null;
  status: CameraStatus | null;
  fps: number | null;
  last_frame_age_s: number | null;
}

/** `POST /local/uniform/calibrate` */
export interface CalibrateIn {
  camera_id: string;
  /** Normalized `x1, y1, x2, y2`. */
  box: [number, number, number, number];
}

export interface CalibrateOut {
  /** Hue in degrees (0..360), saturation and value 0..1. */
  uniform_hsv: [number, number, number];
}

export interface PairIn {
  code: string;
  cloud_url: string;
}

export interface PairOut {
  device_id: string;
  site_id: string;
}

/** One ONVIF device from discovery (`rv_edge.ingest.discovery.DiscoveredCamera`). */
export interface DiscoveredDevice {
  address?: string;
  xaddrs?: string[];
  manufacturer?: string | null;
  model?: string | null;
  name?: string | null;
}

export interface DiscoveryOut {
  available: boolean;
  devices: unknown[];
  error: string | null;
}

/** PIN length limits (`rv_edge/runtime/setup_pin.py`). */
export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 64;

/** One table the edge proposes (`POST /local/cameras/{id}/suggest-tables`). Normalized coords. */
export interface TableSuggestion {
  suggestion_id: string;
  polygon: [number, number][];
  table_box: [number, number, number, number];
  seats_est: number;
  confidence: number;
}

/** Why the edge could not (fully) suggest tables. */
export type SuggestNote = 'simulated_camera' | 'no_model' | 'no_frame';

export interface SuggestTablesIn {
  min_confidence?: number;
}

export interface SuggestTablesOut {
  camera_id: string;
  suggestions: TableSuggestion[];
  note: SuggestNote | null;
}
