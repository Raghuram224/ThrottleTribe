// Where I am along the route and what that means (docs/design/21 §3.7, §3.8). Pure, no React, no clock: every
// time is passed in, so GPS-jitter and timing sequences are plain unit tests.
import { buildPlainTrail, trailMatches, type Trail, type TrailMatch } from '@/lib/geo';
import type { NavRoute, RemainingToStop } from '@/lib/nav-route';
import { announcedSteps, treatedAs, type NavStep } from '@/lib/nav-steps';

/** One position fix, whichever source it came from (foreground watch now, background task in P3). */
export interface NavFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  courseDeg: number | null;
  /** The fix's own timestamp (ms since epoch): the dedupe and ordering key. */
  t: number;
}

/** A route ready for progress: its geometry as a trail and the announced steps (always ending with `arrive`). */
export interface PreparedRoute {
  /** Changes with every new route; progress belongs to one id. */
  id: number;
  route: NavRoute;
  trail: Trail;
  announced: NavStep[];
  /**
   * Where each announced step counts as passed (same indices as `announced`). The step's own `alongM`, except a
   * roundabout / rotary with an exit number: its entry is where the banner points, but it is passed at the exit
   * (the next raw step), or the rider is told "next" while still circling.
   */
  passAt: number[];
}

export function prepareRoute(route: NavRoute, id: number): PreparedRoute {
  const trail = buildPlainTrail(route.coords);
  const end = route.coords[route.coords.length - 1];
  const announced = announcedSteps(route.steps, end, trail.totalM);
  const raw = route.steps ?? [];
  const passAt = announced.map((s) => {
    const as = treatedAs(s);
    if ((as !== 'roundabout' && as !== 'rotary') || s.exit === null) return s.alongM;
    const next = raw[raw.indexOf(s) + 1];
    return next && next.alongM > s.alongM ? Math.min(next.alongM, trail.totalM) : s.alongM;
  });
  return { id, route, trail, announced, passAt };
}

export interface Progress {
  routeId: number;
  /** Index into `announced` of the next maneuver; never goes back. */
  idx: number;
  /** Route distance covered (m). Moved by good fixes only: it is what step advance and the floor are built on. */
  alongM: number;
  /** The distance the banner shows: `alongM`, except that a poor fix refreshes this one alone. */
  displayAlongM: number;
  /** The rider has been on the line at least once; before that there is no off-route and no reroute (M2). */
  joined: boolean;
  /** An implausible forward jump seen on the previous fix, waiting for a second consistent one. */
  pendingAlongM: number | null;
  /** Consecutive good fixes past the pass margin of maneuver `idx`. */
  passCount: number;
  /** Consecutive good off-route fixes. */
  offCount: number;
  /** Consecutive good on-route fixes (clears `offRoute` at 2). */
  onCount: number;
  offRoute: boolean;
  /** Distance from the route line at the last fix (m); 0 before the first. */
  offTrailM: number;
  /** When (receipt time, ms) the last good fix arrived; null until the first. */
  lastGoodAt: number | null;
  /** Speed at that fix, for dead reckoning; null when unknown. */
  lastSpeedMps: number | null;
}

export function initProgress(routeId: number): Progress {
  return {
    routeId,
    idx: 0,
    alongM: 0,
    displayAlongM: 0,
    joined: false,
    pendingAlongM: null,
    passCount: 0,
    offCount: 0,
    onCount: 0,
    offRoute: false,
    offTrailM: 0,
    lastGoodAt: null,
    lastSpeedMps: null,
  };
}

// ---------------------------------------------------------------- step advance (§3.7)

/** A fix this inaccurate never advances a step and never counts toward off-route. */
export const GOOD_FIX_MAX_ACCURACY_M = 50;
/** Projection window around the current position along the route. */
export const WINDOW_BACK_M = 100;
export const WINDOW_FWD_M = 1500;
/** Window match worse than this: try the whole route, but accept that only when it is this close (a tunnel). */
export const WINDOW_MISS_M = 150;
export const REACQUIRE_MAX_OFF_M = 30;
/** Small backward jitter of the projection is absorbed. */
export const JITTER_BACK_M = 30;
/** Past a maneuver by this much counts as a pass fix; 2 of them (or one at PASS_NOW_M) advance the step. */
export const PASS_MARGIN_M = 20;
export const PASS_NOW_M = 60;
export const PASS_FIXES = 2;

export const isGoodFix = (accuracyM: number | null | undefined): boolean =>
  accuracyM == null || accuracyM <= GOOD_FIX_MAX_ACCURACY_M;

/** Another stretch of the route this much further from me than the best one is still a candidate (divided roads). */
export const MATCH_MARGIN_M = 20;
/** A forward jump of the projection beyond speed x dt + this needs a second consistent fix. */
export const JUMP_BASE_M = 50;
/** At this speed the fix's course is trusted to pick the carriageway: matches heading > 90 degrees away lose. */
export const COURSE_MIN_MPS = 15 / 3.6;
export const COURSE_MAX_DIFF_DEG = 90;

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** The fix's course when it is usable for choosing a carriageway (moving, a real number), else null. */
function usableCourse(fix: NavFix): number | null {
  const { courseDeg, speedMps } = fix;
  if (courseDeg == null || !Number.isFinite(courseDeg) || courseDeg < 0 || courseDeg > 360) return null;
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < COURSE_MIN_MPS) return null;
  return courseDeg;
}

const earliest = (ms: TrailMatch[]): TrailMatch => ms.reduce((a, m) => (m.alongM < a.alongM ? m : a));
const nearest = (ms: TrailMatch[]): TrailMatch => ms.reduce((a, m) => (m.offTrailM < a.offTrailM ? m : a));

/** Matches going my way; every one of them when none does (the middle of a U-turn) or there is no course. */
function byCourse(ms: TrailMatch[], course: number | null): TrailMatch[] {
  if (course === null || ms.length < 2) return ms;
  const ok = ms.filter((m) => angleDiff(m.headingDeg, course) <= COURSE_MAX_DIFF_DEG);
  return ok.length > 0 ? ok : ms;
}

/**
 * No history (the first fix, or not on the line yet): the earliest of the stretches that are about as near as the
 * best. A route that leaves the start, turns round and comes back passes it twice; the rider is at the first pass.
 */
function pickFirst(ms: TrailMatch[], course: number | null): TrailMatch | null {
  return ms.length ? earliest(byCourse(ms, course)) : null;
}

/** With history: the earliest stretch that is not behind me (a return carriageway 15 m away is not "next"). */
function pickContinuous(ms: TrailMatch[], alongM: number, course: number | null): TrailMatch | null {
  if (!ms.length) return null;
  const pool = byCourse(ms, course);
  const ahead = pool.filter((m) => m.alongM >= alongM - JITTER_BACK_M);
  return ahead.length ? earliest(ahead) : nearest(pool);
}

/**
 * One fix. Poor fixes only refresh the displayed distance: they never touch `alongM`, off-route counts or steps. Good
 * fixes also count toward off-route and advance `idx` (2 fixes at +20 m past the maneuver, or one at +60 m,
 * repeated for steps passed together). The very first fix on a route, and every fix until the rider is first on
 * the line (a start away from the road), is matched against the whole route. `now` is the receipt time, used for
 * dead reckoning and the GPS-lost rule.
 */
export function stepProgress(p: Progress, fix: NavFix, route: PreparedRoute, now: number): Progress {
  const { trail, announced, passAt } = route;
  const good = isGoodFix(fix.accuracyM);
  const course = usableCourse(fix);
  const speed = fix.speedMps != null && fix.speedMps >= 0 && Number.isFinite(fix.speedMps) ? fix.speedMps : p.lastSpeedMps;
  // What the rider could have covered since the last good fix, for the plausibility gate.
  const dtS = p.lastGoodAt === null ? 1 : Math.max(1, (now - p.lastGoodAt) / 1000);
  const plausibleM = Math.max(fix.speedMps ?? 0, p.lastSpeedMps ?? 0, 0) * dtS + JUMP_BASE_M;

  let proj: { alongM: number; offTrailM: number };
  let reacquired = false;
  if (!p.joined) {
    proj = pickFirst(trailMatches(trail, fix, -Infinity, Infinity, MATCH_MARGIN_M), course) ?? { alongM: 0, offTrailM: Infinity };
  } else {
    proj =
      pickContinuous(trailMatches(trail, fix, p.alongM - WINDOW_BACK_M, p.alongM + WINDOW_FWD_M, MATCH_MARGIN_M), p.alongM, course) ??
      { alongM: p.alongM, offTrailM: Infinity };
    if (proj.offTrailM > WINDOW_MISS_M) {
      const whole = pickFirst(trailMatches(trail, fix, -Infinity, Infinity, MATCH_MARGIN_M), course);
      // Back on the line somewhere else (a tunnel): take it. Otherwise this fix says nothing about where along the
      // route I am (the window's nearest point is only its edge), so the distance holds and off-route takes over.
      if (whole && whole.offTrailM <= REACQUIRE_MAX_OFF_M) {
        proj = whole;
        reacquired = true;
      } else {
        proj = { alongM: p.alongM, offTrailM: proj.offTrailM };
      }
    }
  }

  if (!good) {
    // Display only (H2): a poor fix must never ratchet the distance the next good fix is floored against.
    return { ...p, displayAlongM: p.joined ? Math.max(p.alongM - JITTER_BACK_M, proj.alongM) : p.alongM };
  }

  // Plausibility gate (H3): a jump further than the rider can have travelled needs a second consistent fix.
  let pendingAlongM: number | null = null;
  if (p.joined && !reacquired && p.lastGoodAt !== null && proj.alongM - p.alongM > plausibleM) {
    const consistent = p.pendingAlongM !== null && Math.abs(proj.alongM - p.pendingAlongM) <= plausibleM;
    if (!consistent) {
      pendingAlongM = proj.alongM;
      proj = { alongM: p.alongM, offTrailM: proj.offTrailM };
    }
  }

  const off = isOffFix(proj.offTrailM, fix.accuracyM);
  if (!p.joined && off) {
    // Not on the road yet: nothing to follow, nothing to leave, nothing to reroute (M2).
    return { ...p, offTrailM: proj.offTrailM, lastGoodAt: now, lastSpeedMps: speed };
  }

  const alongM = p.joined ? Math.max(p.alongM - JITTER_BACK_M, proj.alongM) : proj.alongM;
  let { offCount, onCount, offRoute } = p;
  if (off) {
    offCount += 1;
    onCount = 0;
    if (offRouteNow(offCount, proj.offTrailM)) offRoute = true;
  } else {
    // One good on-route fix breaks a run of off fixes (they must be consecutive); two clear the off-route state.
    offCount = 0;
    onCount += 1;
    if (onCount >= 2) offRoute = false;
  }

  let { idx, passCount } = p;
  if (!off) {
    const last = announced.length - 1;
    while (idx < last) {
      const at = passAt[idx];
      if (alongM >= at + PASS_NOW_M) {
        idx += 1;
        passCount = 0;
        continue;
      }
      if (alongM >= at + PASS_MARGIN_M) {
        passCount += 1;
        if (passCount >= PASS_FIXES) {
          idx += 1;
          passCount = 0;
          continue;
        }
      } else {
        passCount = 0;
      }
      break;
    }
  }

  return {
    ...p,
    idx,
    alongM,
    displayAlongM: alongM,
    joined: true,
    pendingAlongM,
    passCount,
    offCount,
    onCount,
    offRoute,
    offTrailM: proj.offTrailM,
    lastGoodAt: now,
    lastSpeedMps: speed,
  };
}

/** Dead reckoning only runs at speed, and only for this long (then the banner says GPS lost). */
export const DEAD_RECKON_MIN_S = 2;
export const GPS_LOST_MS = 10_000;
export const DEAD_RECKON_MIN_KMH = 15;

/**
 * Metres to take off the displayed distance because no good fix has arrived for 2 to 10 s. Display only. Past 10 s
 * the last fix is too old to extrapolate from (GPS lost, or the app just came back from the background): 0.
 */
export function deadReckonM(p: Progress, now: number): number {
  if (p.lastGoodAt === null || p.lastSpeedMps === null) return 0;
  if (p.lastSpeedMps * 3.6 < DEAD_RECKON_MIN_KMH) return 0;
  const dt = (now - p.lastGoodAt) / 1000;
  if (dt < DEAD_RECKON_MIN_S || dt > GPS_LOST_MS / 1000) return 0;
  return p.lastSpeedMps * dt;
}

/**
 * No good fix for 10 s (from the last one, or from when navigation started / resumed). `lastGoodAt` is the engine's
 * own clock of good fixes, which runs with or without a route; progress only exists once there is one.
 */
export function gpsLost(lastGoodAt: number | null, startedAt: number, now: number): boolean {
  const since = Math.max(lastGoodAt ?? 0, startedAt);
  return now - since >= GPS_LOST_MS;
}

/** Distance to the next maneuver (m), shortened by dead reckoning, never below 0. */
export function maneuverDistanceM(p: Progress, route: PreparedRoute, now?: number): number {
  const step = route.announced[Math.min(p.idx, route.announced.length - 1)];
  const dr = now === undefined ? 0 : deadReckonM(p, now);
  return Math.max(0, step.alongM - p.displayAlongM - dr);
}

/** The maneuver after the current one, only when the "Then" row shows: not `arrive`, at most 500 m later. */
export const THEN_MAX_GAP_M = 500;
export function thenStep(p: Progress, route: PreparedRoute): NavStep | null {
  const cur = route.announced[p.idx];
  const next = route.announced[p.idx + 1];
  if (!cur || !next || next.type === 'arrive') return null;
  return next.alongM - cur.alongM <= THEN_MAX_GAP_M ? next : null;
}

/** Route metres left to the end of the line. */
export function remainingAlongM(p: Progress, route: PreparedRoute): number {
  return Math.max(0, route.trail.totalM - p.alongM);
}

/**
 * Distance and ETA left to the destination from engine progress (M5), so the stop card says what the banner says:
 * the route line left, and the route's duration in the same share. Not re-projected from a second position.
 */
export function engineRemaining(p: Progress, route: PreparedRoute): RemainingToStop {
  const total = route.trail.totalM;
  const left = Math.max(0, total - p.alongM);
  return {
    distanceM: left,
    durationS: total > 0 ? route.route.durationS * (left / total) : null,
    approximate: false,
  };
}

/** On the last announced step (`arrive`). */
export function onFinalStep(p: Progress, route: PreparedRoute): boolean {
  return p.idx >= route.announced.length - 1;
}

// ---------------------------------------------------------------- off route and reroute (§3.8)

export const OFF_ROUTE_MIN_M = 35;
export const OFF_ROUTE_MAX_M = 75;
export const OFF_ROUTE_FIXES = 3;
export const OFF_ROUTE_FAR_M = 250;
/** Minimum gap between route requests: 10 s, then longer after failures, then 60 s. */
export const NAV_REROUTE_BACKOFF_S = [10, 20, 40, 60] as const;
/** The OSRM demo allows at most one request per second, whatever the reason for it. */
export const REQUEST_MIN_GAP_MS = 1000;
/** `bearings` is sent only while moving at least this fast with a usable course. */
export const BEARING_MIN_KMH = 15;

/** Further from the line than this (1.5 x the fix's accuracy, between 35 and 75 m) is an off-route fix. */
export function isOffFix(offTrailM: number, accuracyM: number | null): boolean {
  const limit = Math.min(OFF_ROUTE_MAX_M, Math.max(OFF_ROUTE_MIN_M, (accuracyM ?? 20) * 1.5));
  return offTrailM > limit;
}

/** Off route: 3 consecutive good off fixes, or one fix more than 250 m away. */
export function offRouteNow(offCount: number, offTrailM: number): boolean {
  return offCount >= OFF_ROUTE_FIXES || offTrailM > OFF_ROUTE_FAR_M;
}

/** The gap required before the next route request after `failures` failures in a row. */
export function backoffMs(failures: number): number {
  return NAV_REROUTE_BACKOFF_S[Math.min(Math.max(0, failures), NAV_REROUTE_BACKOFF_S.length - 1)] * 1000;
}

export interface RerouteInput {
  offRoute: boolean;
  /** When the last route request started; -Infinity (or 0) when there was none. */
  lastFetchAt: number;
  failures: number;
  inFlight: boolean;
  now: number;
  /** No network: never fetch. */
  offline?: boolean;
}

/** A reroute is due: off route, nothing in flight, online, and the backoff gap has passed. */
export function shouldRerouteNav(a: RerouteInput): boolean {
  if (!a.offRoute || a.inFlight || a.offline) return false;
  return a.now - a.lastFetchAt >= backoffMs(a.failures);
}

/**
 * Whether to ask for a route right now: a reroute (off route) or the first/retried fetch when there is no route.
 * Same backoff for both; the first attempt (lastFetchAt = -Infinity) goes at once. Capped at 1 request/s.
 */
export function shouldFetchNavRoute(a: RerouteInput & { hasRoute: boolean; lastRequestAt: number }): boolean {
  if (a.now - a.lastRequestAt < REQUEST_MIN_GAP_MS) return false;
  if (!a.hasRoute) {
    if (a.inFlight || a.offline) return false;
    // No route to lose: the first request is immediate, retries follow the backoff after failures.
    if (a.lastFetchAt === -Infinity) return true;
    return a.now - a.lastFetchAt >= backoffMs(Math.max(0, a.failures - 1));
  }
  return shouldRerouteNav(a);
}

/** `bearings` start heading for a reroute: my course while moving at least 15 km/h, else none. */
export function startBearing(fix: Pick<NavFix, 'courseDeg' | 'speedMps'>): number | null {
  const { courseDeg, speedMps } = fix;
  if (courseDeg == null || !Number.isFinite(courseDeg) || courseDeg < 0 || courseDeg > 360) return null;
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps * 3.6 < BEARING_MIN_KMH) return null;
  return courseDeg % 360;
}
