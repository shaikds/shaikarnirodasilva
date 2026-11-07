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
  camera_count: number;
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

/** A camera as the edge lists it. `url` is always redacted (`rtsp://***@host/...`). */
export interface CameraOut {
  camera_id: string;
  kind: string;
  url: string;
  has_credentials: boolean;
  loop: boolean;
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
