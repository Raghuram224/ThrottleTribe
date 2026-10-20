// What the navigation engine publishes and how the banner reads it (docs/design/21 §2.7, §3.6). Pure, no React.
// The engine itself (nav-session.ts) writes `NavEngineState` into nav-store; screens only read it.
import { bearingDeg, haversineM, type LatLng } from '@/lib/geo';
import {
  gpsLost,
  maneuverDistanceM,
  thenStep,
  type NavFix,
  type PreparedRoute,
  type Progress,
} from '@/lib/nav-progress';
import type { NavStep } from '@/lib/nav-steps';
import { size } from '@/theme/tokens';

export type RouteStatus = 'none' | 'loading' | 'ok' | 'unavailable';

export interface NavEngineState {
  /** A session is running for `key`. */
  active: boolean;
  rideId: string | null;
  /** Destination identity (`lat,lng`), the same key the arrival latch uses. */
  key: string;
  dest: LatLng | null;
  /** When the session started or was resumed (ms): the GPS-lost clock before the first good fix. */
  startedAt: number;
  routeStatus: RouteStatus;
  prepared: PreparedRoute | null;
  progress: Progress | null;
  /** The last accepted fix: my position while navigating (newer than the server echo). */
  fix: NavFix | null;
  /**
   * When (receipt time, ms) the last good fix arrived; null until the first. Kept here, not in progress, because
   * it must run while there is no route yet (a failed first request): GPS-lost is about fixes, not routes.
   */
  lastGoodFixAt: number | null;
  /** A route request is in flight. */
  fetching: boolean;
  /** The last request was rate limited (24 §3.4): the rerouting banner says "Routes are busy", the old line stays. */
  routeBusy: boolean;
}

export const EMPTY_ENGINE: NavEngineState = {
  active: false,
  rideId: null,
  key: '',
  dest: null,
  startedAt: 0,
  routeStatus: 'none',
  prepared: null,
  progress: null,
  fix: null,
  lastGoodFixAt: null,
  fetching: false,
  routeBusy: false,
};

/**
 * Navigation is on: the ride is live, has a stop I have not arrived at, and I am its leader (a rider left alone in
 * someone else's ride does not start it). It starts for a ride of one; once riders have joined (22 D5: a ride becomes
 * a group by sharing its code) it carries on for the leader who was navigating (`engineRunning` while the screens
 * stay up, `navRide` after Back to Home or a restart), and is never started for a ride that already has riders.
 * Everyone else gets the route line and the stop card: group turn-by-turn waits for hosted routing (D1).
 */
export function isNavActive(a: {
  solo: boolean;
  /** I am the ride's leader. */
  leader: boolean;
  /** This phone navigated the ride before (lib/nav-rides). */
  navRide: boolean;
  rideLive: boolean;
  hasStop: boolean;
  arrived: boolean;
  engineRunning: boolean;
}): boolean {
  return a.rideLive && a.hasStop && !a.arrived && (a.engineRunning || (a.leader && (a.solo || a.navRide)));
}

export interface PositionLike {
  lat: number;
  lng: number;
  /** Fix time (ms since epoch). */
  t: number;
}

/** The newer of the local fix and the server echo of my own sample (§3.6); the local one wins a tie. */
export function newestPosition<A extends PositionLike, B extends PositionLike>(local: A | null, remote: B | null): A | B | null {
  if (!local) return remote;
  if (!remote) return local;
  return local.t >= remote.t ? local : remote;
}

/** A start point (or an echo of my position) is this old at most: older is not "where I am" for routing. */
export const ORIGIN_MAX_AGE_MS = 30_000;

/**
 * Where to route from at session start: the newest of the candidates that is at most 30 s old (the local fix, the
 * server echo of my position, the Where-to origin), else null: the session then waits for its first local fix
 * (the banner says "starting") instead of routing from a position the rider has long left.
 */
export function pickOrigin(cands: readonly ({ lat: number; lng: number; t: number } | null)[], now: number): LatLng | null {
  let best: { lat: number; lng: number; t: number } | null = null;
  for (const c of cands) {
    if (!c || !Number.isFinite(c.t) || now - c.t > ORIGIN_MAX_AGE_MS) continue;
    if (!best || c.t > best.t) best = c;
  }
  return best ? { lat: best.lat, lng: best.lng } : null;
}

// ---------------------------------------------------------------- banner

export type BannerKind = 'guide' | 'starting' | 'toRoad' | 'noRoute' | 'rerouting' | 'offlineOffRoute' | 'noGps';

export interface BannerModel {
  kind: BannerKind;
  /** guide: the next maneuver, the distance to it and the "Then" step (null = no Then row). */
  step: NavStep | null;
  distanceM: number;
  then: NavStep | null;
  /** noRoute: straight-line distance and bearing from me to the destination. */
  straightM: number | null;
  bearingDeg: number | null;
  /** rerouting: the request was rate limited, so line 2 says "Routes are busy · retrying" (24 §3.4). */
  busy?: boolean;
  /** Main row 96, plus the Then row 40 in `guide`. */
  height: number;
}

export interface BannerInput {
  /** Navigation is on (isNavActive); false = no banner. */
  active: boolean;
  /** The engine state, already checked to belong to the current destination (else pass EMPTY_ENGINE). */
  engine: NavEngineState;
  /** Location services on and foreground permission granted. */
  locationOk: boolean;
  netOffline: boolean;
  now: number;
  /** My position for the straight-line fallback (newest of local and server). */
  me: LatLng | null;
  dest: LatLng | null;
}

/**
 * The banner for this moment, or null when navigation is off. Priority when several apply:
 * noGps > offlineOffRoute > rerouting > starting > noRoute > toRoad > guide (§2.7). `toRoad`: a route exists but I
 * have not been on it yet (the start is away from the road).
 */
export function selectBanner(a: BannerInput): BannerModel | null {
  if (!a.active) return null;
  const { engine } = a;
  const base = { step: null, distanceM: 0, then: null, straightM: null, bearingDeg: null, height: size.navBanner };
  const lost = !a.locationOk || (engine.active && gpsLost(engine.lastGoodFixAt, engine.startedAt, a.now));
  if (lost) return { ...base, kind: 'noGps' };
  const prepared = engine.prepared;
  const progress = engine.progress;
  const offRoute = !!progress?.offRoute && !!prepared;
  if (offRoute) return { ...base, kind: a.netOffline ? 'offlineOffRoute' : 'rerouting', busy: engine.routeBusy };
  if (!prepared || !progress) {
    const hasFix = engine.fix !== null || a.me !== null;
    // No road route: still loading (or not asked yet, without a position) is "starting"; a settled failure is "noRoute".
    if (engine.routeStatus === 'unavailable' && hasFix) {
      const me = a.me;
      return {
        ...base,
        kind: 'noRoute',
        straightM: me && a.dest ? haversineM(me, a.dest) : null,
        bearingDeg: me && a.dest ? bearingDeg(me, a.dest) : null,
      };
    }
    return { ...base, kind: 'starting' };
  }
  if (!progress.joined) return { ...base, kind: 'toRoad' };
  const idx = Math.min(progress.idx, prepared.announced.length - 1);
  const step = prepared.announced[idx];
  const then = thenStep(progress, prepared);
  return {
    ...base,
    kind: 'guide',
    step,
    distanceM: maneuverDistanceM(progress, prepared, a.now),
    then,
    height: size.navBanner + (then ? size.navThenRow : 0),
  };
}

/**
 * Accessibility: the maneuver changed (the idx of the guide banner), not just its distance. Screen readers hear
 * the instruction once per maneuver, and only when voice is muted (no double speech; P3).
 */
export function maneuverKey(banner: BannerModel | null, routeId: number): string {
  return banner?.kind === 'guide' && banner.step ? `${routeId}:${banner.step.alongM}:${banner.step.type}` : '';
}
