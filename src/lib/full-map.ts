// Pure decisions for the full-map live screen and the solo ride (19 §B, §C). No React.
/** The speed bubble shows nothing under this. */
export const MIN_SHOWN_KMH = 3;

/** Whole km/h from m/s, or null when unknown or crawling (< 3 km/h). */
export function shownSpeedKmh(mps: number | null | undefined): number | null {
  return mps != null && Number.isFinite(mps) && mps * 3.6 >= MIN_SHOWN_KMH ? Math.round(mps * 3.6) : null;
}

/** Android hardware back: full map is left first; otherwise the screen's normal back behaviour runs. */
export function backAction(fullMap: boolean): 'exit-full-map' | 'default' {
  return fullMap ? 'exit-full-map' : 'default';
}

/**
 * Full map is the default only the first time a FREE solo ride opens, tracked per ride id (not global):
 * `seenRideId` is the last ride whose first open was already handled. A ride that already has a stop
 * (a navigation ride, 21 decision 2) opens in sheet mode: the panel is where distance and ETA live.
 */
export function shouldDefaultFullMap(args: {
  activeMembers: number;
  rideId: string;
  seenRideId: string | null;
  hasStop: boolean;
}): boolean {
  return args.activeMembers === 1 && args.seenRideId !== args.rideId && !args.hasStop;
}

/**
 * What the solo full-map default does on this render. An SOS hold in progress defers it ('wait'): switching to
 * full map swaps the bar's SOS button for the floating one and would drop the hold with no hint. The default
 * is not marked as seen while waiting, so it applies once the finger lifts.
 */
export function fullMapDefaultStep(args: {
  activeMembers: number;
  rideId: string;
  seenRideId: string | null;
  hasStop: boolean;
  holding: boolean;
}): 'seen' | 'wait' | 'mark' | 'enter' {
  if (args.seenRideId === args.rideId) return 'seen';
  if (args.holding) return 'wait';
  return shouldDefaultFullMap(args) ? 'enter' : 'mark';
}
