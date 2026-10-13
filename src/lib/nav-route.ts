// Route from my position to the shared next stop (docs/design/19 "Route to the stop"). OSRM demo
// server, drawn only on my phone. Pure helpers plus one fetch wrapper; no React.
import { t } from '@/lib/copy';
import { formatDistance, formatDuration } from '@/lib/format';
import { buildTrail, haversineM, projectOntoTrail, type LatLng, type Trail } from '@/lib/geo';

export const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
export const ROUTE_TIMEOUT_MS = 8000;
/** Further than this from the route line means re-route. */
export const REROUTE_OFF_M = 150;
/** At most one fetch per this long (also the retry delay after a failed fetch). */
export const REROUTE_MIN_INTERVAL_MS = 60_000;
/** Far off the line (a wrong turn, a GPS jump, an old route after a restart): re-route almost at once. */
export const REROUTE_FAR_M = 1000;
export const REROUTE_FAR_INTERVAL_MS = 5_000;
/** Within this of the stop counts as arrived. */
export const ARRIVED_WITHIN_M = 150;

export interface NavRoute {
  /** Road geometry, start to stop. */
  coords: LatLng[];
  distanceM: number;
  durationS: number;
}

export function buildOsrmUrl(from: LatLng, to: LatLng): string {
  return `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
}

/** Reads an OSRM /route response; null when it holds no usable route. */
export function parseOsrmResponse(json: unknown): NavRoute | null {
  const r = (json as { routes?: unknown } | null)?.routes;
  const route = Array.isArray(r) ? (r[0] as Record<string, unknown> | undefined) : undefined;
  const raw = (route?.geometry as { coordinates?: unknown } | undefined)?.coordinates;
  if (!route || !Array.isArray(raw)) return null;
  const coords: LatLng[] = [];
  for (const c of raw) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
    coords.push({ lat: c[1], lng: c[0] });
  }
  const distanceM = route.distance;
  const durationS = route.duration;
  if (coords.length < 2 || typeof distanceM !== 'number' || typeof durationS !== 'number') return null;
  return { coords, distanceM, durationS };
}

/** Fetches the driving route; null on any failure (offline, timeout, no route, abort). Never throws. */
export async function fetchNavRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<NavRoute | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(buildOsrmUrl(from, to), { signal: controller.signal });
    if (!res.ok) return null;
    return parseOsrmResponse(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// One trail per route object: shouldReroute runs on every position update.
const trails = new WeakMap<NavRoute, Trail>();
function trailOf(route: NavRoute): Trail {
  let trail = trails.get(route);
  if (!trail) {
    trail = buildTrail(route.coords);
    trails.set(route, trail);
  }
  return trail;
}

/**
 * True when a new route should be fetched: more than 150 m from the route line (or no route yet)
 * AND at least 60 s since the last fetch. A changed stop is the caller's job (fetch at once).
 */
export function shouldReroute(me: LatLng, route: NavRoute | null, lastFetchAt: number, now: number): boolean {
  const since = now - lastFetchAt;
  if (since < REROUTE_FAR_INTERVAL_MS) return false;
  if (!route) return since >= REROUTE_MIN_INTERVAL_MS;
  const off = projectOntoTrail(trailOf(route), me).offTrailM;
  if (off > REROUTE_FAR_M) return true;
  return since >= REROUTE_MIN_INTERVAL_MS && off > REROUTE_OFF_M;
}

/** Glyph by stop kind (the ride row stores no place category). */
export function stopGlyph(kind: string | null | undefined): string {
  return kind === 'destination' ? '🏁' : '☕';
}

export interface RemainingToStop {
  distanceM: number;
  /** Null without a route (only a straight-line distance is known). */
  durationS: number | null;
  /** True when distanceM is the straight line rather than along the road. */
  approximate: boolean;
}

/** Distance (and ETA) still to go: along the route when there is one, else straight line. */
export function remainingToStop(me: LatLng, stop: LatLng, route: NavRoute | null): RemainingToStop {
  const straight = haversineM(me, stop);
  if (!route || route.distanceM <= 0) return { distanceM: straight, durationS: null, approximate: true };
  const trail = trailOf(route);
  const proj = projectOntoTrail(trail, me);
  if (trail.totalM <= 0 || proj.offTrailM > REROUTE_OFF_M * 3) {
    return { distanceM: straight, durationS: null, approximate: true };
  }
  const left = Math.max(0, trail.totalM - proj.alongM);
  const share = left / trail.totalM;
  return {
    distanceM: left + proj.offTrailM,
    durationS: route.durationS * share,
    approximate: false,
  };
}

export interface StopCardInput {
  name: string;
  kind: string | null;
  me: LatLng | null;
  stop: LatLng;
  route: NavRoute | null;
}

export interface StopCardText {
  text: string;
  arrived: boolean;
}

/**
 * Next-stop card line: "☕ Name · 3.4 km · 9 min", "☕ Name · ≈ 3.4 km" when there is no route,
 * "You've arrived" within 150 m, and just "☕ Name" while my position is unknown.
 */
export function stopCardText({ name, kind, me, stop, route }: StopCardInput): StopCardText {
  const glyph = stopGlyph(kind);
  if (!me) return { text: t('stop.cardLineNoDistance', { glyph, name }), arrived: false };
  if (haversineM(me, stop) < ARRIVED_WITHIN_M) return { text: t('stop.arrived'), arrived: true };
  const rem = remainingToStop(me, stop, route);
  const km = formatDistance(rem.distanceM);
  if (rem.approximate || rem.durationS === null) {
    return { text: t('stop.cardLineApprox', { glyph, name, km }), arrived: false };
  }
  return {
    text: t('stop.cardLine', { glyph, name, km, eta: formatDuration(rem.durationS * 1000) }),
    arrived: false,
  };
}
