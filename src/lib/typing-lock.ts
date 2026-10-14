// No typing while riding (docs/design/21 §2.2.2). Pure, with hysteresis so a speed hovering around the
// threshold does not flicker the input.

/** Locks at or above this speed. */
export const LOCK_KMH = 10;
/** Once locked, stays locked until the speed drops under this. */
export const UNLOCK_KMH = 5;
/** An older fix is no evidence of movement. */
export const MAX_FIX_AGE_MS = 10_000;

/**
 * `prev` is the current lock. Unknown speed or a stale fix never locks (no evidence); 10 km/h or more
 * locks; between 5 and 10 keeps whatever it was; under 5 unlocks.
 */
export function typingLocked(prev: boolean, speedKmh: number | null, fixAgeMs: number): boolean {
  if (speedKmh == null || !Number.isFinite(speedKmh) || !Number.isFinite(fixAgeMs) || fixAgeMs > MAX_FIX_AGE_MS) {
    return false;
  }
  if (speedKmh >= LOCK_KMH) return true;
  return prev && speedKmh >= UNLOCK_KMH;
}
