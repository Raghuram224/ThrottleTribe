// Speed for the typing lock on the pre-ride screens (21 §2.2.2). A Balanced-accuracy watch often reports speed
// 0 (Android) or -1 (iOS) while moving, so when the reported speed is no use it is derived from how far the
// position moved between two fixes. Pure, no React.
import { haversineM } from '@/lib/geo';

export interface SpeedFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** The speed the OS reported (m/s); null, 0 or negative = not usable. */
  speedMps: number | null;
  /** When the OS took the fix (ms). Only differences are used, so clock skew does not matter. */
  takenAt: number;
}

/** Fixes this inaccurate say nothing about movement. */
export const SPEED_MAX_ACCURACY_M = 50;
/** Two fixes closer in time than this are too noisy to divide by. */
export const SPEED_MIN_DT_MS = 1000;
/** ...and further apart than this are no longer "now". */
export const SPEED_MAX_DT_MS = 30_000;

/**
 * Speed in m/s, or null when there is no evidence (first fix, poor accuracy, too short or too long a gap).
 * A reported speed above 0 is trusted. Otherwise the distance between the two fixes counts only beyond the
 * fixes' own accuracy, so GPS jitter while standing still reads as 0, not as movement.
 */
export function deriveSpeed(prev: SpeedFix | null, cur: SpeedFix): number | null {
  if (cur.speedMps != null && Number.isFinite(cur.speedMps) && cur.speedMps > 0) return cur.speedMps;
  if (!prev) return null;
  const dt = cur.takenAt - prev.takenAt;
  if (dt < SPEED_MIN_DT_MS || dt > SPEED_MAX_DT_MS) return null;
  if (cur.accuracyM == null || prev.accuracyM == null) return null;
  if (cur.accuracyM > SPEED_MAX_ACCURACY_M || prev.accuracyM > SPEED_MAX_ACCURACY_M) return null;
  const dist = haversineM(prev, cur);
  // Inside the accuracy circle the fix may not have moved at all.
  if (dist <= Math.max(cur.accuracyM, prev.accuracyM)) return 0;
  return dist / (dt / 1000);
}

/**
 * The fix the next one is compared with. It stays put while fixes arrive faster than `SPEED_MIN_DT_MS`
 * (fast riding with a 10 m distance filter), so the gap can grow to something divisible by.
 */
export function nextAnchor(prev: SpeedFix | null, cur: SpeedFix): SpeedFix {
  return prev && cur.takenAt - prev.takenAt >= 0 && cur.takenAt - prev.takenAt < SPEED_MIN_DT_MS ? prev : cur;
}

/** Watch only while the screen is focused, location is allowed and the app is in the foreground (22 §4.3). */
export function planningWatchWanted(a: { focused: boolean; granted: boolean; appActive: boolean }): boolean {
  return a.focused && a.granted && a.appActive;
}

/** A fix older than this is no longer "where I am": the home map removes its marker (22 §4.4). */
export const FIX_MAX_AGE_MS = 120_000;

/** `at` and `now` are ms since epoch; a fix from the future (clock skew) is not stale. */
export function fixFresh(at: number, now: number): boolean {
  return now - at <= FIX_MAX_AGE_MS;
}
