// Pure count-up maths for the summary hero (docs/design/13 §9). No React, no native modules.
import { formatDistance } from '@/lib/format';

/** Easing.out(Easing.cubic) as a function: 0 -> 0, 1 -> 1, fast start, slow finish. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** The metres to show at `progress` (0..1) of a count-up towards `meters`. Never overshoots. */
export function countUpMeters(meters: number, progress: number): number {
  return Math.max(0, meters) * easeOutCubic(progress);
}

/** Text at `progress`; at 1 it is exactly the final `formatDistance(meters)`. */
export function countUpDistanceText(meters: number, progress: number): string {
  return formatDistance(progress >= 1 ? meters : countUpMeters(meters, progress));
}
