// Route sketches for Home -> Recent rides (16 §3): my samples simplified to <= 48 points and
// normalised to a 0..1 box. Pure module: no React, no native modules.
import type { LatLng } from '@/lib/geo';

export type SketchPoint = readonly [number, number];

export const SKETCH_MAX_POINTS = 48;
const PREPASS_MAX = 400;
const EARTH_M_PER_DEG = 111_320;

interface XY {
  x: number;
  y: number;
}

/** Equirectangular projection to metres around the points' mean latitude (y grows northwards). */
function project(points: LatLng[]): XY[] {
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  return points.map((p) => ({ x: p.lng * EARTH_M_PER_DEG * k, y: p.lat * EARTH_M_PER_DEG }));
}

function perpDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Indices kept by Douglas-Peucker at tolerance `eps` (iterative, so 5000 points cannot overflow the stack). */
function douglasPeucker(pts: XY[], eps: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop() as [number, number];
    let worst = -1;
    let worstD = eps;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDistance(pts[i], pts[lo], pts[hi]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/** At most `max` points that keep the shape: the tolerance is widened until the result fits. */
export function simplifyPoints(points: LatLng[], max = SKETCH_MAX_POINTS): LatLng[] {
  if (points.length <= max) return points;
  // Cheap pre-pass: bisecting DP over thousands of samples is slow on a phone, and a 56 dp tile
  // cannot show more than a few hundred.
  if (points.length > PREPASS_MAX) {
    const stride = Math.ceil(points.length / PREPASS_MAX);
    const thinned = points.filter((_, i) => i % stride === 0);
    if (thinned[thinned.length - 1] !== points[points.length - 1]) thinned.push(points[points.length - 1]);
    points = thinned;
  }
  const xy = project(points);
  let lo = 0;
  let hi = Math.max(
    ...xy.map((p) => Math.hypot(p.x - xy[0].x, p.y - xy[0].y)),
    1,
  );
  let best = douglasPeucker(xy, hi);
  // Bisect the tolerance for the smallest eps that fits `max` points.
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const kept = douglasPeucker(xy, mid);
    if (kept.length <= max) {
      best = kept;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best.map((i) => points[i]);
}

/**
 * Normalises to a unit box: uniform scale (no distortion), centred along the shorter axis, y flipped
 * so north is up. Null when the route has no extent (a ride that never moved).
 */
export function normalizeSketch(points: LatLng[]): SketchPoint[] | null {
  if (points.length < 2) return null;
  const xy = project(points);
  const xs = xy.map((p) => p.x);
  const ys = xy.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  // Under ~20 m the "route" is GPS jitter.
  if (!(span > 20)) return null;
  const offX = (span - (maxX - minX)) / 2;
  const offY = (span - (maxY - minY)) / 2;
  return xy.map((p) => [(p.x - minX + offX) / span, 1 - (p.y - minY + offY) / span] as const);
}

/** Cleaned samples -> sketch, or null when there is nothing worth drawing. */
export function buildSketch(points: LatLng[]): SketchPoint[] | null {
  return normalizeSketch(simplifyPoints(points));
}

export interface SketchSegment {
  /** Centre of the segment in dp. */
  cx: number;
  cy: number;
  length: number;
  /** Clockwise rotation in degrees (RN `rotate`) of a horizontal bar. */
  angleDeg: number;
}

/** Segment geometry for drawing the sketch with plain Views in a `box` dp square with `pad` inset. */
export function sketchSegments(points: readonly SketchPoint[], box: number, pad: number): SketchSegment[] {
  const inner = box - pad * 2;
  const at = (p: SketchPoint): XY => ({ x: pad + p[0] * inner, y: pad + p[1] * inner });
  const out: SketchSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = at(points[i - 1]);
    const b = at(points[i]);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 0.5) continue;
    out.push({
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      length,
      angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    });
  }
  return out;
}

/** Joint and end positions in dp. */
export function sketchPoints(points: readonly SketchPoint[], box: number, pad: number): XY[] {
  const inner = box - pad * 2;
  return points.map((p) => ({ x: pad + p[0] * inner, y: pad + p[1] * inner }));
}

// ---------------------------------------------------------------- storage format

const DECIMALS = 1000;

/** `{ [rideId]: [x0, y0, x1, y1, ...] }` rounded to 3 decimals: ~0.6 KB per ride. */
export function serializeSketches(all: Record<string, readonly SketchPoint[]>): string {
  const out: Record<string, number[]> = {};
  for (const [id, pts] of Object.entries(all)) {
    out[id] = pts.flatMap((p) => [Math.round(p[0] * DECIMALS) / DECIMALS, Math.round(p[1] * DECIMALS) / DECIMALS]);
  }
  return JSON.stringify(out);
}

export function parseSketches(raw: string | null): Record<string, SketchPoint[]> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, SketchPoint[]> = {};
    for (const [id, flat] of Object.entries(value)) {
      if (!Array.isArray(flat) || flat.length < 4 || flat.length % 2 !== 0) continue;
      if (!flat.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) continue;
      const pts: SketchPoint[] = [];
      for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]] as const);
      out[id] = pts;
    }
    return out;
  } catch {
    return {};
  }
}
