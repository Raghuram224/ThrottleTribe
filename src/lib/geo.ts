export interface LatLng {
  lat: number;
  lng: number;
}

/** A position with an optional timestamp (ms), used to reject impossible GPS jumps. */
export interface TimedLatLng extends LatLng {
  t?: number;
}

export interface Trail {
  points: LatLng[];
  /** Distance along the trail to each point; cumulativeM[0] is 0. */
  cumulativeM: number[];
  totalM: number;
  /** Timestamp of the last accepted point, when known. */
  lastT?: number;
  /** A point that implied an impossible jump; accepted only if the next point agrees with it. */
  pending?: TimedLatLng;
}

export interface TrailProjection {
  /** Distance along the trail to the projection (plus the distance past the end when beyond it). */
  alongM: number;
  /** Perpendicular distance from the trail. */
  offTrailM: number;
}

export type RelativeKind = 'ahead' | 'behind' | 'level' | 'away';

export interface RelativePosition {
  kind: RelativeKind;
  distanceM: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
/** Closer than this along the trail counts as riding together. */
export const LEVEL_WITHIN_M = 100;
/** Hysteresis: a rider already shown as level stays level until this far apart (stops flicker). */
export const LEVEL_EXIT_M = 150;
/** Further than this from the trail, ahead/behind is meaningless. */
export const OFF_TRAIL_M = 500;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees, 0..360 clockwise from north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** A single step longer than this is a GPS jump, whatever the timestamps say. */
export const MAX_STEP_M = 2000;
/** Faster than this between two samples (200 km/h) is a GPS jump. */
export const MAX_SPEED_MPS = 200 / 3.6;
/** Two consecutive points this close agree with each other (they confirm a jump). */
const CONFIRM_WITHIN_M = 200;
/** Matching a far-back segment only wins over the head when it is clearly closer (by this margin). */
const HEAD_TIE_M = 25;

function isImpossibleStep(last: LatLng, lastT: number | undefined, p: TimedLatLng, d: number): boolean {
  if (d > MAX_STEP_M) return true;
  if (lastT !== undefined && p.t !== undefined) {
    const dt = (p.t - lastT) / 1000;
    if (dt > 0 && d / dt > MAX_SPEED_MPS) return true;
  }
  return false;
}

/** Mutable working copy used by buildTrail so a long build stays linear. */
function emptyState(): Trail {
  return { points: [], cumulativeM: [], totalM: 0 };
}

function step(trail: Trail, p: TimedLatLng, minSpacingM: number, mutate: boolean): Trail {
  const clean = (q: TimedLatLng): LatLng => ({ lat: q.lat, lng: q.lng });
  const last = trail.points[trail.points.length - 1];
  const out = mutate ? trail : { ...trail };
  if (!last) {
    out.points = [clean(p)];
    out.cumulativeM = [0];
    out.totalM = 0;
    out.lastT = p.t;
    out.pending = undefined;
    return out;
  }
  const d = haversineM(last, p);
  if (isImpossibleStep(last, trail.lastT, p, d)) {
    const pend = trail.pending;
    if (pend && haversineM(pend, p) < CONFIRM_WITHIN_M) {
      // Two consecutive points agree: the jump was real, restart the trail from them.
      out.points = [clean(pend)];
      out.cumulativeM = [0];
      out.totalM = 0;
      out.lastT = pend.t;
      out.pending = undefined;
      return step(out, p, minSpacingM, true);
    }
    out.pending = { lat: p.lat, lng: p.lng, t: p.t };
    return out;
  }
  out.pending = undefined;
  if (d < minSpacingM || d <= 0) return out;
  out.totalM = trail.totalM + d;
  if (mutate) {
    out.points.push(clean(p));
    out.cumulativeM.push(out.totalM);
  } else {
    out.points = [...trail.points, clean(p)];
    out.cumulativeM = [...trail.cumulativeM, out.totalM];
  }
  out.lastT = p.t;
  return out;
}

/**
 * Keeps a point only when it is at least `minSpacingM` from the last kept one, and drops points
 * that imply an impossible jump (> 2 km in one step or > 200 km/h) unless the next point confirms it.
 */
export function buildTrail(points: TimedLatLng[], minSpacingM = 20): Trail {
  const trail = emptyState();
  for (const p of points) step(trail, p, minSpacingM, true);
  trail.pending = undefined;
  return trail;
}

/** Returns a trail extended by `p`, or the same trail when `p` is closer than `minSpacingM` to its end. */
export function appendToTrail(trail: Trail, p: TimedLatLng, minSpacingM = 20): Trail {
  const next = step(trail, p, minSpacingM, false);
  // Nothing changed: keep identity so subscribers do not re-render.
  if (next.points === trail.points && next.pending === trail.pending) return trail;
  return next;
}

/** Projects onto the nearest trail segment using a local equirectangular approximation. */
export function projectOntoTrail(trail: Trail, point: LatLng): TrailProjection {
  const n = trail.points.length;
  if (n === 0) return { alongM: 0, offTrailM: Infinity };
  if (n === 1) return { alongM: 0, offTrailM: haversineM(trail.points[0], point) };

  let best: TrailProjection = { alongM: 0, offTrailM: Infinity };
  let bestClampedDist = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < n - 1; i++) {
    const a = trail.points[i];
    const b = trail.points[i + 1];
    const cosLat = Math.cos(toRad(a.lat));
    const mPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
    const mPerDegLng = mPerDegLat * cosLat;
    const bx = (b.lng - a.lng) * mPerDegLng;
    const by = (b.lat - a.lat) * mPerDegLat;
    const px = (point.lng - a.lng) * mPerDegLng;
    const py = (point.lat - a.lat) * mPerDegLat;
    const segLen = Math.hypot(bx, by);
    if (segLen === 0) continue;

    const rawT = (px * bx + py * by) / (segLen * segLen);
    const isLast = i === n - 2;
    const t = Math.min(isLast ? Infinity : 1, Math.max(0, rawT));
    const clampedT = Math.min(1, Math.max(0, rawT));
    // Select the segment by distance to the clamped point so a far-away rider is not
    // matched to a segment whose infinite line happens to pass near it.
    const clampedDist = Math.hypot(px - clampedT * bx, py - clampedT * by);
    if (clampedDist < bestClampedDist) {
      bestClampedDist = clampedDist;
      // Beyond the last point, offTrail is the perpendicular distance to the extended line
      // and the overshoot is added to alongM.
      const perp = Math.abs(px * by - py * bx) / segLen;
      bestIdx = i;
      best = {
        alongM: trail.cumulativeM[i] + t * segLen,
        offTrailM: t > 1 ? perp : clampedDist,
      };
    }
  }

  // A rider right beside the trail's head but matched to a segment far behind it (a trail that
  // doubles back or starts with junk) is at the head, not back there: prefer "beyond the end".
  const lastPt = trail.points[n - 1];
  const dLast = haversineM(lastPt, point);
  if (bestIdx < n - 2 && dLast < OFF_TRAIL_M && dLast <= best.offTrailM + HEAD_TIE_M) {
    const a = trail.points[n - 2];
    const mPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
    const mPerDegLng = mPerDegLat * Math.cos(toRad(a.lat));
    const bx = (lastPt.lng - a.lng) * mPerDegLng;
    const by = (lastPt.lat - a.lat) * mPerDegLat;
    const px = (point.lng - a.lng) * mPerDegLng;
    const py = (point.lat - a.lat) * mPerDegLat;
    const segLen = Math.hypot(bx, by);
    if (segLen > 0) {
      const t = Math.max(0, (px * bx + py * by) / (segLen * segLen));
      return {
        alongM: trail.cumulativeM[n - 2] + t * segLen,
        offTrailM: t > 1 ? Math.abs(px * by - py * bx) / segLen : dLast,
      };
    }
  }
  return best;
}

/** Where `them` is relative to `me`, measured along the leader's trail. */
export function relativePosition(
  trail: Trail | null,
  me: LatLng,
  them: LatLng,
  /** Was this rider level on the previous update? Then the exit threshold applies (150 m, not 100 m). */
  wasLevel = false,
): RelativePosition {
  const straight = (): RelativePosition => ({ kind: 'away', distanceM: haversineM(me, them) });
  if (!trail || trail.points.length < 2) return straight();

  const a = projectOntoTrail(trail, me);
  const b = projectOntoTrail(trail, them);
  if (a.offTrailM > OFF_TRAIL_M || b.offTrailM > OFF_TRAIL_M) return straight();

  const delta = b.alongM - a.alongM;
  const distanceM = Math.abs(delta);
  if (distanceM < (wasLevel ? LEVEL_EXIT_M : LEVEL_WITHIN_M)) return { kind: 'level', distanceM };
  return { kind: delta > 0 ? 'ahead' : 'behind', distanceM };
}
