// RTSP URL templates per camera brand, mirroring rv_edge/ingest/rtsp_templates.py.
// The edge API stores whatever URL it is given (it does not build URLs from a brand), so the
// wizard builds them here. Credentials are NOT put into the URL: they go in the separate
// write-only `username`/`password` fields and the edge merges them (secrets_store.with_credentials).

export type BrandKey = 'hikvision' | 'dahua' | 'uniview' | 'axis' | 'provision_isr' | 'generic';

export interface BrandTemplate {
  key: BrandKey;
  label: string;
  /** Path with `{ch}` (channel) and `{st}` (stream token). */
  path: string;
  mainToken: string;
  subToken: string;
}

export const BRANDS: readonly BrandTemplate[] = [
  { key: 'hikvision', label: 'Hikvision', path: '/Streaming/Channels/{ch}0{st}', mainToken: '1', subToken: '2' },
  { key: 'dahua', label: 'Dahua', path: '/cam/realmonitor?channel={ch}&subtype={st}', mainToken: '0', subToken: '1' },
  { key: 'uniview', label: 'Uniview (UNV)', path: '/unicast/c{ch}/s{st}/live', mainToken: '0', subToken: '1' },
  {
    key: 'axis',
    label: 'Axis',
    path: '/axis-media/media.amp?camera={ch}{st}',
    mainToken: '',
    subToken: '&videocodec=h264&resolution=640x360',
  },
  { key: 'provision_isr', label: 'Provision-ISR', path: '/profile{st}', mainToken: '1', subToken: '2' },
  { key: 'generic', label: 'Generic / other', path: '/stream{st}', mainToken: '1', subToken: '2' },
];

export const GENERIC: BrandKey = 'generic';
export const DEFAULT_RTSP_PORT = 554;

const BY_KEY = new Map(BRANDS.map((b) => [b.key, b]));

const BRAND_HINTS: readonly (readonly [string, BrandKey])[] = [
  ['hikvision', 'hikvision'],
  ['hilook', 'hikvision'],
  ['dahua', 'dahua'],
  ['amcrest', 'dahua'],
  ['lorex', 'dahua'],
  ['uniview', 'uniview'],
  ['unv', 'uniview'],
  ['axis', 'axis'],
  ['provision', 'provision_isr'],
];

export function brandTemplate(key: string): BrandTemplate {
  return BY_KEY.get(normalizeBrand(key))!;
}

/** Guess a brand from manufacturer/model/name strings (e.g. ONVIF discovery). */
export function guessBrand(...texts: (string | null | undefined)[]): BrandKey | null {
  const joined = texts.filter(Boolean).join(' ').toLowerCase();
  const words = new Set(joined.split(/[^a-z0-9]+/));
  for (const [needle, key] of BRAND_HINTS) {
    if (words.has(needle) || (needle.length > 3 && joined.includes(needle))) return key;
  }
  return null;
}

/** Free-form brand name to a known key (unknown -> generic). */
export function normalizeBrand(brand: string): BrandKey {
  const key = brand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (BY_KEY.has(key as BrandKey)) return key as BrandKey;
  return guessBrand(brand) ?? GENERIC;
}

export interface RtspParts {
  brand: string;
  host: string;
  channel?: number;
  substream?: boolean;
  port?: number;
  /** Overrides the brand template (path from the camera's manual). */
  path?: string | null;
}

export type RtspError = 'hostRequired' | 'channelInvalid' | 'portInvalid';

/** Validation of the brand form, same rules as rtsp_url(). */
export function rtspPartsError(parts: RtspParts): RtspError | null {
  if (!parts.host.trim()) return 'hostRequired';
  const channel = parts.channel ?? 1;
  if (!Number.isInteger(channel) || channel < 1) return 'channelInvalid';
  const port = parts.port ?? DEFAULT_RTSP_PORT;
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) return 'portInvalid';
  return null;
}

/**
 * `rtsp://host:port/path` for a brand (rtsp_templates.rtsp_url without credentials).
 * Throws on invalid parts; check `rtspPartsError` first.
 */
export function buildRtspUrl(parts: RtspParts): string {
  const error = rtspPartsError(parts);
  if (error) throw new Error(error);
  let host = parts.host.trim();
  if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`; // IPv6 literal
  const template = brandTemplate(parts.brand);
  const channel = parts.channel ?? 1;
  const token = (parts.substream ?? true) ? template.subToken : template.mainToken;
  let rendered =
    parts.path != null && parts.path !== ''
      ? parts.path
      : template.path.replace('{ch}', String(channel)).replace('{st}', token);
  if (!rendered.startsWith('/')) rendered = `/${rendered}`;
  return `rtsp://${host}:${parts.port ?? DEFAULT_RTSP_PORT}${rendered}`;
}

/** Shown under the form: the URL as the edge will list it (user info hidden). */
export function previewUrl(url: string, hasUser: boolean): string {
  if (!hasUser) return url;
  return url.replace(/^([a-z]+:\/\/)/i, '$1***@');
}

/** True for URLs the edge accepts for an RTSP camera (local_api.CameraIn). */
export function isAcceptedCameraUrl(url: string): boolean {
  return /^(rtsps?|https?):\/\/\S+$/i.test(url.trim());
}

/** True if the URL carries user info (`user:pass@`). */
export function hasUserInfo(url: string): boolean {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url);
  return !!m && m[1]!.includes('@');
}

export interface ParsedCameraUrl {
  host: string;
  port: number;
  brand: BrandKey | null;
  channel: number | null;
  substream: boolean | null;
}

/**
 * Best-effort reverse of `buildRtspUrl` for a (redacted) URL from `GET /local/cameras`, used to
 * prefill the edit form. Returns null when it is not an rtsp URL.
 */
export function parseCameraUrl(url: string): ParsedCameraUrl | null {
  const m = /^rtsps?:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?(\/[^#]*)?$/i.exec(url.trim());
  if (!m) return null;
  const host = m[1]!.replace(/^\[|\]$/g, '');
  const port = m[2] ? Number(m[2]) : DEFAULT_RTSP_PORT;
  const path = m[3] ?? '/';
  for (const b of BRANDS) {
    if (b.key === GENERIC) continue;
    for (const sub of [true, false]) {
      const token = sub ? b.subToken : b.mainToken;
      const pattern = escapeRegExp(b.path)
        .replace('\\{ch\\}', '(\\d+)')
        .replace('\\{st\\}', escapeRegExp(token));
      const hit = new RegExp(`^${pattern}$`).exec(path);
      if (hit) {
        const channel = b.path.includes('{ch}') ? Number(hit[1]) : 1;
        return { host, port, brand: b.key, channel, substream: sub };
      }
    }
  }
  const generic = /^\/stream([12])$/.exec(path);
  if (generic) return { host, port, brand: GENERIC, channel: 1, substream: generic[1] === '2' };
  return { host, port, brand: null, channel: null, substream: null };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SECRET_QUERY_KEYS = new Set([
  'user',
  'username',
  'usr',
  'password',
  'pass',
  'passwd',
  'pwd',
  'token',
  'auth',
  'key',
]);

/**
 * `url` with user info and credential-like query values replaced by `***`
 * (rtsp_templates.redact_url). The edge already redacts what it lists; this is a second guard
 * so nothing secret-looking is ever rendered.
 */
export function redactUrl(url: string): string {
  let out = url;
  const sep = out.indexOf('://');
  if (sep !== -1) {
    const start = sep + 3;
    const at = out.lastIndexOf('@');
    if (at >= start) out = `${out.slice(0, start)}***${out.slice(at)}`;
  }
  const q = out.indexOf('?');
  if (q === -1) return out;
  const hashAt = out.indexOf('#', q);
  const query = out.slice(q + 1, hashAt === -1 ? undefined : hashAt);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      return SECRET_QUERY_KEYS.has(key.toLowerCase()) ? `${key}=***` : pair;
    })
    .join('&');
  return `${out.slice(0, q + 1)}${redacted}${hashAt === -1 ? '' : out.slice(hashAt)}`;
}
