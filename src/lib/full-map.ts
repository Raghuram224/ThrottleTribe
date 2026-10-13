// Pure decisions for the full-map live screen and the solo ride (19 §B, §C). No React.
import { copy, t } from '@/lib/copy';

/** Speed bubble and the solo summary show nothing under this (same cut-off as the me row). */
export const MIN_SHOWN_KMH = 3;

/** Whole km/h from m/s, or null when unknown or crawling (< 3 km/h). */
export function shownSpeedKmh(mps: number | null | undefined): number | null {
  return mps != null && Number.isFinite(mps) && mps * 3.6 >= MIN_SHOWN_KMH ? Math.round(mps * 3.6) : null;
}

/** Sheet summary with exactly one active member: "Solo ride · 42 km/h", or "Solo ride" when stopped. */
export function soloSummaryLine(speedKmh: number | null): string {
  return speedKmh == null ? copy['live.soloSummary'] : t('live.soloSummarySpeed', { kmh: speedKmh });
}

/** Android hardware back: full map is left first; otherwise the screen's normal back behaviour runs. */
export function backAction(fullMap: boolean): 'exit-full-map' | 'default' {
  return fullMap ? 'exit-full-map' : 'default';
}

/**
 * Full map is the default only the first time a solo ride opens, tracked per ride id (not global):
 * `seenRideId` is the last ride whose first open was already handled.
 */
export function shouldDefaultFullMap(args: {
  activeMembers: number;
  rideId: string;
  seenRideId: string | null;
}): boolean {
  return args.activeMembers === 1 && args.seenRideId !== args.rideId;
}
