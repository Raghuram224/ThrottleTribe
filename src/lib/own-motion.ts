// Course-over-ground and speed derived from my own consecutive positions. Used when the GPS course or
// speed is missing or untrustworthy (emulator `geo fix`, some browsers, many devices at low speed).
// Pure: no React, no clock. Conventions: course is degrees clockwise from north, 0..360.
import { bearingDeg, haversineM, MAX_SPEED_MPS, MAX_STEP_M } from '@/lib/geo';

export interface Fix {
  lat: number;
  lng: number;
  /** Fix time in ms (the sample's recorded_at, not the arrival time). */
  t: number;
}

export interface DerivedMotion {
  /** Null when no earlier fix is far enough away to give a stable direction. */
  courseDeg: number | null;
  speedKmh: number;
}

/** The earlier fix must be at least this far (metres): shorter baselines are mostly GPS noise. */
export const MOTION_MIN_DIST_M = 15;
/** ...and at most this old (ms), so the course follows turns instead of averaging them away. */
export const MOTION_MAX_AGE_MS = 15_000;
/** Fixes older than this are dropped from the history. */
const HISTORY_MS = 20_000;
/** With no far-enough fix, a window at least this long with almost no movement means "stopped". */
const STOPPED_WINDOW_MS = 5_000;

/**
 * Appends a fix. Out-of-order or duplicate timestamps are ignored; an impossible jump (see geo.ts)
 * restarts the history from the new fix, so a teleport never produces a course or a speed.
 */
export function pushFix(history: readonly Fix[], fix: Fix): Fix[] {
  const last = history[history.length - 1];
  if (!last) return [fix];
  if (fix.t <= last.t) return history as Fix[];
  const d = haversineM(last, fix);
  const dt = (fix.t - last.t) / 1000;
  const jump = d > MAX_STEP_M || d / dt > MAX_SPEED_MPS;
  if (jump) return [fix];
  return [...history, fix].filter((f) => fix.t - f.t <= HISTORY_MS);
}

/** Course and speed from the latest fix against the most recent earlier fix that is far enough and recent enough. */
export function deriveMotion(history: readonly Fix[]): DerivedMotion | null {
  const latest = history[history.length - 1];
  if (!latest || history.length < 2) return null;
  for (let i = history.length - 2; i >= 0; i--) {
    const f = history[i];
    const ageMs = latest.t - f.t;
    if (ageMs > MOTION_MAX_AGE_MS) break;
    const d = haversineM(f, latest);
    if (d >= MOTION_MIN_DIST_M) {
      return { courseDeg: bearingDeg(f, latest), speedKmh: (d / (ageMs / 1000)) * 3.6 };
    }
  }
  const oldest = history.find((f) => latest.t - f.t <= MOTION_MAX_AGE_MS) ?? latest;
  const span = latest.t - oldest.t;
  if (span >= STOPPED_WINDOW_MS) {
    return { courseDeg: null, speedKmh: (haversineM(oldest, latest) / (span / 1000)) * 3.6 };
  }
  return null;
}

export interface EffectiveMotion {
  courseDeg: number | null;
  speedKmh: number | null;
}

const validNum = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/**
 * What the app treats as my motion. Speed: the GPS speed when it is a positive number, otherwise the
 * derived speed. Course: the derived one when there is one (it comes from real displacement; a GPS
 * course of 0 with a moving rider is a common "no course" placeholder), else a valid GPS course.
 */
export function effectiveMotion(
  gps: { heading: number | null | undefined; speedMps: number | null | undefined },
  derived: DerivedMotion | null,
): EffectiveMotion {
  const gpsKmh = validNum(gps.speedMps) && gps.speedMps > 0 ? gps.speedMps * 3.6 : null;
  const speedKmh = gpsKmh ?? derived?.speedKmh ?? (validNum(gps.speedMps) ? 0 : null);
  const gpsCourse = validNum(gps.heading) && gps.heading >= 0 && gps.heading <= 360 ? gps.heading : null;
  return { courseDeg: derived?.courseDeg ?? gpsCourse, speedKmh };
}
