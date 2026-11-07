// Geometry for the zone editor, in normalized image coordinates (rv_contracts/geometry.py):
// (0, 0) top-left, (1, 1) bottom-right, y grows downwards. Pure functions; every edit returns a
// new array. Distances that a finger or mouse cares about (hit radii) are measured in pixels of
// the rendered image, because normalized units are not square on a 16:9 picture.
import type { LineDirection } from '@rv/shared';

export type Pt = [number, number];

export interface Size {
  width: number;
  height: number;
}

/** What `getBoundingClientRect()` returns, reduced to what we need. */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Same tolerance as rv_contracts.geometry.EPS. */
export const EPS = 1e-12;
/** Decimals kept in saved coordinates (0.0001 of the image is far below a pixel). */
export const COORD_DECIMALS = 4;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function roundCoord(v: number, decimals = COORD_DECIMALS): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function clampPoint(p: Pt): Pt {
  return [roundCoord(clamp01(p[0])), roundCoord(clamp01(p[1]))];
}

/**
 * Normalized point under a pointer event, for an element at `rect` (its on-screen box).
 * Clamped to the image so a drag past the edge pins the vertex to the border.
 */
export function toNormalized(clientX: number, clientY: number, rect: RectLike): Pt {
  if (rect.width <= 0 || rect.height <= 0) return [0, 0];
  return clampPoint([(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height]);
}

/** Pixel position inside an element of `size` for a normalized point. */
export function toPixels(p: Pt, size: Size): [number, number] {
  return [p[0] * size.width, p[1] * size.height];
}

export function isInUnitSquare(p: readonly number[]): boolean {
  return (
    p.length === 2 &&
    p.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
  );
}

/** Absolute area (shoelace); 0 for fewer than 3 points (rv_contracts.geometry.polygon_area). */
export function polygonArea(polygon: readonly Pt[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % n]!;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** What the contracts accept as a Polygon: >= 3 points in [0,1] with non-zero area. */
export function isValidPolygon(polygon: readonly Pt[]): boolean {
  return polygon.length >= 3 && polygon.every(isInUnitSquare) && polygonArea(polygon) > EPS;
}

// ------------------------------------------------------------------------------- edits
/** Adds `p` at `index` (default: the end). */
export function addVertex(polygon: readonly Pt[], p: Pt, index = polygon.length): Pt[] {
  const i = Math.max(0, Math.min(polygon.length, index));
  return [...polygon.slice(0, i), clampPoint(p), ...polygon.slice(i)];
}

/** Inserts `p` on edge `edgeIndex` (between vertex `edgeIndex` and the next one). */
export function insertOnEdge(polygon: readonly Pt[], edgeIndex: number, p: Pt): Pt[] {
  return addVertex(polygon, p, edgeIndex + 1);
}

export function moveVertex(polygon: readonly Pt[], index: number, p: Pt): Pt[] {
  if (index < 0 || index >= polygon.length) return [...polygon];
  return polygon.map((q, i) => (i === index ? clampPoint(p) : q));
}

/** Moves a vertex by a normalized delta (keyboard nudging). */
export function nudgeVertex(polygon: readonly Pt[], index: number, dx: number, dy: number): Pt[] {
  const q = polygon[index];
  if (!q) return [...polygon];
  return moveVertex(polygon, index, [q[0] + dx, q[1] + dy]);
}

export function removeVertex(polygon: readonly Pt[], index: number): Pt[] {
  if (index < 0 || index >= polygon.length) return [...polygon];
  return polygon.filter((_, i) => i !== index);
}

/** Moves every point by a normalized delta, keeping the whole shape inside the image. */
export function translate(points: readonly Pt[], dx: number, dy: number): Pt[] {
  if (points.length === 0) return [];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cdx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), dx));
  const cdy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), dy));
  return points.map((p) => clampPoint([p[0] + cdx, p[1] + cdy]));
}

// ------------------------------------------------------------------------------- hit tests
export function distancePx(a: Pt, b: Pt, size: Size): number {
  return Math.hypot((a[0] - b[0]) * size.width, (a[1] - b[1]) * size.height);
}

/** Index of the vertex nearest to `p` within `radiusPx` on screen, or -1. */
export function hitTestVertex(points: readonly Pt[], p: Pt, size: Size, radiusPx = 18): number {
  let best = -1;
  let bestDist = Infinity;
  points.forEach((q, i) => {
    const d = distancePx(q, p, size);
    if (d <= radiusPx && d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Distance in pixels from `p` to the segment `a`-`b`. */
export function distanceToSegmentPx(p: Pt, a: Pt, b: Pt, size: Size): number {
  const [px, py] = toPixels(p, size);
  const [ax, ay] = toPixels(a, size);
  const [bx, by] = toPixels(b, size);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Index `i` of the edge (vertex i -> i+1) nearest to `p` within `tolerancePx`, or -1.
 * `closed` includes the closing edge (last -> first).
 */
export function hitTestEdge(
  points: readonly Pt[],
  p: Pt,
  size: Size,
  tolerancePx = 12,
  closed = true,
): number {
  const n = points.length;
  const edges = closed && n >= 3 ? n : n - 1;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < edges; i++) {
    const d = distanceToSegmentPx(p, points[i]!, points[(i + 1) % n]!, size);
    if (d <= tolerancePx && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/** Boundary-inclusive point-in-polygon (rv_contracts.geometry.point_in_polygon). */
export function pointInPolygon(p: Pt, polygon: readonly Pt[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  const [x, y] = p;
  let inside = false;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    if (onSegment(p, a, b)) return true;
    const [x1, y1] = a;
    const [x2, y2] = b;
    if (y1 > y !== y2 > y) {
      const xAtY = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
      if (x < xAtY) inside = !inside;
    }
  }
  return inside;
}

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  if (segmentSide(a, b, p) !== 0) return false;
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** A shape the editor can hit: a polygon or an open polyline (entrance line). */
export interface HitShape {
  id: string;
  points: readonly Pt[];
  closed: boolean;
}

/**
 * The topmost shape under `p` (last in the list wins, like SVG paint order): inside a polygon,
 * or within `tolerancePx` of a line. Returns its id or null.
 */
export function hitTestShapes(
  shapes: readonly HitShape[],
  p: Pt,
  size: Size,
  tolerancePx = 14,
): string | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]!;
    if (s.closed ? pointInPolygon(p, s.points) : hitTestEdge(s.points, p, size, tolerancePx, false) >= 0)
      return s.id;
  }
  return null;
}

// ------------------------------------------------------------------------------- lines
/**
 * Side of `p` relative to the directed line `a -> b` (rv_contracts.geometry.segment_side):
 * +1 right-hand side as seen on screen (y down), -1 left, 0 on the line.
 */
export function segmentSide(a: Pt, b: Pt, p: Pt): -1 | 0 | 1 {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (cross > EPS) return 1;
  if (cross < -EPS) return -1;
  return 0;
}

export function flipDirection(dir: LineDirection): LineDirection {
  return dir === 'left_to_right' ? 'right_to_left' : 'left_to_right';
}

/** +1 when the inside is the right-hand side of a -> b (`left_to_right`), else -1. */
export function inSide(dir: LineDirection): 1 | -1 {
  return dir === 'left_to_right' ? 1 : -1;
}

/**
 * Arrow showing the inward crossing of the line `a -> b`, in pixels of an element of `size`:
 * from the segment midpoint, perpendicular, towards the inside (`in_direction`).
 * Computed in pixel space so the arrow looks perpendicular on a non-square image.
 */
export function inArrow(
  a: Pt,
  b: Pt,
  dir: LineDirection,
  size: Size,
  lengthPx = 36,
): { from: [number, number]; to: [number, number] } {
  const [ax, ay] = toPixels(a, size);
  const [bx, by] = toPixels(b, size);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // (-dy, dx) points to the right-hand side on screen (y down).
  const s = inSide(dir);
  const nx = (-dy / len) * s;
  const ny = (dx / len) * s;
  return { from: [mx - nx * lengthPx * 0.5, my - ny * lengthPx * 0.5], to: [mx + nx * lengthPx, my + ny * lengthPx] };
}

// ------------------------------------------------------------------------------- misc
/** Area-weighted centroid (falls back to the mean for degenerate shapes). */
export function centroid(points: readonly Pt[]): Pt {
  const n = points.length;
  if (n === 0) return [0.5, 0.5];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % n]!;
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (n < 3 || Math.abs(a) <= EPS) {
    return [
      points.reduce((s, p) => s + p[0], 0) / n,
      points.reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function midpoint(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Normalized box `[x1, y1, x2, y2]` spanned by two corners (any order), clamped. */
export function boxFromCorners(a: Pt, b: Pt): [number, number, number, number] {
  const [x1, y1] = clampPoint([Math.min(a[0], b[0]), Math.min(a[1], b[1])]);
  const [x2, y2] = clampPoint([Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
  return [x1, y1, x2, y2];
}

/** A box big enough to be meaningful on screen (and valid for the API: x1 < x2, y1 < y2). */
export function isUsableBox(box: readonly number[], size: Size, minPx = 12): boolean {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = box;
  return x2 > x1 && y2 > y1 && (x2 - x1) * size.width >= minPx && (y2 - y1) * size.height >= minPx;
}
