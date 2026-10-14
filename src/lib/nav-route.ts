// Route from my position to the shared next stop (docs/design/19 "Route to the stop"). OSRM demo
// server, drawn only on my phone. Pure helpers plus one fetch wrapper; no React.
import { t } from '@/lib/copy';
import { ROUTING_SUPPORTS_EXCLUDE, ROUTING_URL } from '@/lib/flags';
import { formatDistance, formatDuration } from '@/lib/format';
import { buildPlainTrail, buildTrail, haversineM, projectOntoTrail, type LatLng, type Trail } from '@/lib/geo';
import { parseSteps, type NavStep } from '@/lib/nav-steps';
import { routingHeaders } from '@/lib/routing-headers';

export { ROUTING_URL };
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
  /**
   * Expressway avoidance that was applied: true = the route was computed with `exclude=motorway`, false =
   * it was asked for but the server rejected it (this route may use expressways), undefined = not asked for.
   */
  avoidedMotorways?: boolean;
  /** Turn steps (21 §3.2); undefined when the route was fetched without `steps=true`. */
  steps?: NavStep[];
}

export interface NavRouteOptions {
  /** Ask for turn steps (P2 consumes them). */
  steps?: boolean;
  /** Adds `exclude=motorway` (21 expressway decision). */
  avoidMotorways?: boolean;
  /** Start heading in degrees, so a reroute does not send the rider into a U-turn (P2). */
  bearingDeg?: number | null;
  /**
   * Skip the 5 min cache, both ways (the engine's requests: a reroute from where I am now must not be answered with a
   * route cached for an origin up to ~100 m behind me). Not part of the request or the cache key.
   */
  noCache?: boolean;
}

export function buildOsrmUrl(from: LatLng, to: LatLng, o: NavRouteOptions = {}): string {
  return (
    `${ROUTING_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson` +
    (o.steps ? '&steps=true' : '') +
    (o.avoidMotorways ? '&exclude=motorway' : '') +
    bearingsParam(o.bearingDeg)
  );
}

/**
 * `&bearings=<deg>,45;` for the start point (the second waypoint is unconstrained), or '' when the heading is not
 * a usable number. OSRM answers HTTP 400 InvalidValue to a malformed bearing, so it is normalised to a whole 0..359.
 */
export function bearingsParam(bearingDeg: number | null | undefined): string {
  if (bearingDeg == null || typeof bearingDeg !== 'number' || !Number.isFinite(bearingDeg)) return '';
  return `&bearings=${Math.round(((bearingDeg % 360) + 360) % 360) % 360},45;`;
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
  const steps = parseSteps(route.legs, buildPlainTrail(coords).totalM);
  return steps ? { coords, distanceM, durationS, steps } : { coords, distanceM, durationS };
}

// ---------------------------------------------------------------- exclude support

/**
 * True when OSRM refused the `exclude` parameter. The public demo answers HTTP 400
 * `{"code":"InvalidValue","message":"Exclude flag combination is not supported."}` (checked 2026-10-13):
 * its car profile has no excludable road classes. Then the caller retries once without it.
 * Only an exclude-related InvalidValue counts: another bad parameter (a `bearings` value, P2) must not
 * switch avoidance off for every route.
 */
export function excludeRejected(status: number, body: unknown, excludeSet: boolean): boolean {
  if (!excludeSet || status !== 400) return false;
  const b = (body ?? {}) as { code?: unknown; message?: unknown };
  return b.code === 'InvalidValue' && typeof b.message === 'string' && /exclude/i.test(b.message);
}

/** How long a server's "exclude not supported" answer is remembered, so we do not pay a doomed request per route. */
export const EXCLUDE_UNSUPPORTED_MEMO_MS = 30 * 60_000;
let excludeUnsupportedAt: number | null = null;

/** True while a recent rejection says `exclude` would be refused: skip it and go straight to the plain route. */
export function excludeKnownUnsupported(now: number, at: number | null = excludeUnsupportedAt): boolean {
  return at !== null && now - at < EXCLUDE_UNSUPPORTED_MEMO_MS;
}

/**
 * True when a request with `avoidMotorways` really carries `exclude`: the router must support it (flag) and not
 * have refused it recently. Otherwise the avoid choice makes no difference to the request or the cache key.
 */
export function excludeEffective(now: number): boolean {
  return ROUTING_SUPPORTS_EXCLUDE && !excludeKnownUnsupported(now);
}

/**
 * Told when the router refuses `exclude` (the root layout wires it to telemetry; this module stays free of
 * app services so the pure logic loads in tests).
 */
let excludeRejectedListener: (() => void) | null = null;
export function setExcludeRejectedListener(fn: (() => void) | null): void {
  excludeRejectedListener = fn;
}

/** Test helper. */
export function resetRoutingMemo(): void {
  excludeUnsupportedAt = null;
  cache.length = 0;
}

// ---------------------------------------------------------------- fetch

export type NavRouteResult =
  | { status: 'ok'; route: NavRoute }
  /** OSRM answered but there is no road between the points. */
  | { status: 'no_route' }
  /** Offline, timeout, server error or an unreadable answer. */
  | { status: 'failed' };

/** In-memory cache (21 §3.1): key `round(from,3)|to|opts`, 5 min, 4 entries. A back-and-forth does not refetch. */
const CACHE_MAX = 4;
const CACHE_TTL_MS = 5 * 60_000;
const cache: { key: string; at: number; route: NavRoute }[] = [];

export function routeCacheKey(from: LatLng, to: LatLng, o: NavRouteOptions): string {
  const bearing = o.bearingDeg != null && Number.isFinite(o.bearingDeg) ? Math.round(o.bearingDeg / 15) : '';
  return [
    `${from.lat.toFixed(3)},${from.lng.toFixed(3)}`,
    `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`,
    o.steps ? 's' : '',
    // Not sent = not part of the key, so flipping the switch back (or a known-unsupported router) hits the cache.
    o.avoidMotorways && excludeEffective(Date.now()) ? 'a' : '',
    bearing,
  ].join('|');
}

function cacheGet(key: string, now: number): NavRoute | null {
  const i = cache.findIndex((e) => e.key === key);
  if (i < 0) return null;
  const hit = cache[i];
  cache.splice(i, 1);
  if (now - hit.at > CACHE_TTL_MS) return null;
  cache.unshift(hit);
  return hit.route;
}

function cacheSet(key: string, route: NavRoute, now: number): void {
  const i = cache.findIndex((e) => e.key === key);
  if (i >= 0) cache.splice(i, 1);
  cache.unshift({ key, at: now, route });
  if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
}

interface Answer {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * Fetches the driving route. Never throws. With `avoidMotorways` (and a router that supports it, flags) it asks for
 * `exclude=motorway`; when the server rejects that, it retries once without and marks the route
 * `avoidedMotorways: false`. Without router support `exclude` is never sent.
 */
export async function fetchNavRouteResult(
  from: LatLng,
  to: LatLng,
  opts: NavRouteOptions = {},
  signal?: AbortSignal,
): Promise<NavRouteResult> {
  const startedAt = Date.now();
  const key = routeCacheKey(from, to, opts);
  const cached = opts.noCache ? null : cacheGet(key, startedAt);
  if (cached) return { status: 'ok', route: cached };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const request = async (o: NavRouteOptions): Promise<Answer> => {
    const res = await fetch(buildOsrmUrl(from, to, o), { signal: controller.signal, headers: routingHeaders() });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // An unreadable body is a failure below (status decides).
    }
    return { ok: res.ok, status: res.status, body };
  };
  const finish = (a: Answer, avoided: boolean | undefined): NavRouteResult => {
    const code = (a.body as { code?: unknown } | null)?.code;
    if (code === 'NoRoute') return { status: 'no_route' };
    if (!a.ok) return { status: 'failed' };
    const route = parseOsrmResponse(a.body);
    if (!route) return { status: Array.isArray((a.body as { routes?: unknown } | null)?.routes) ? 'no_route' : 'failed' };
    const full = avoided === undefined ? route : { ...route, avoidedMotorways: avoided };
    // Keyed again now: a rejection just remembered by the memo changes what the key means.
    if (!opts.noCache) cacheSet(routeCacheKey(from, to, opts), full, Date.now());
    return { status: 'ok', route: full };
  };

  try {
    // A router known not to honour `exclude` is never asked: no doomed request, no marked-down route.
    if (!ROUTING_SUPPORTS_EXCLUDE) return finish(await request({ ...opts, avoidMotorways: false }), undefined);
    const wantExclude = !!opts.avoidMotorways;
    if (!wantExclude) return finish(await request(opts), undefined);
    if (excludeKnownUnsupported(startedAt)) {
      return finish(await request({ ...opts, avoidMotorways: false }), false);
    }
    const first = await request(opts);
    if (excludeRejected(first.status, first.body, true)) {
      excludeUnsupportedAt = Date.now();
      excludeRejectedListener?.();
      return finish(await request({ ...opts, avoidMotorways: false }), false);
    }
    return finish(first, true);
  } catch {
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Fetches the driving route; null on any failure (offline, timeout, no route, abort). Never throws. */
export async function fetchNavRoute(
  from: LatLng,
  to: LatLng,
  opts: NavRouteOptions = {},
  signal?: AbortSignal,
): Promise<NavRoute | null> {
  const r = await fetchNavRouteResult(from, to, opts, signal);
  return r.status === 'ok' ? r.route : null;
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
  /**
   * Whether I have arrived, decided by the caller from the arrival latch (nav-arrival), so the card and the
   * panel cannot disagree. Left out: the plain within-150 m check.
   */
  arrived?: boolean;
  /**
   * Distance and ETA from the navigation engine's progress (`engineRemaining`), so the card agrees with the turn
   * banner. Left out: derived from `me` and the route here.
   */
  remaining?: RemainingToStop | null;
}

export interface StopCardParts {
  /** "3.4 km", or "≈ 3.4 km" without a route; null when arrived or my position is unknown. */
  distance: string | null;
  /** The bare "3.4 km" (no "≈"), for the screen-reader label. */
  km: string | null;
  /** "9 min"; null without a route, when arrived, or without my position. */
  eta: string | null;
  /** True when the distance is the straight line rather than along the road. */
  approximate: boolean;
  arrived: boolean;
  name: string;
  kind: string | null;
  /** One compact line without any glyph, for the full-map chip: "Name · 3.4 km · 9 min". */
  text: string;
}

/**
 * Next-stop card parts (20 C5): distance and ETA are the fact, the name is the sub line. Approximate
 * (no route) puts "≈" on the distance, arrived (< 150 m) drops both, and an unknown position leaves
 * only the name.
 */
export function stopCardText({ name, kind, me, stop, route, arrived, remaining }: StopCardInput): StopCardParts {
  const base = { name, kind, approximate: false, arrived: false, distance: null, km: null, eta: null };
  if (arrived) return { ...base, arrived: true, text: t('stop.arrived') };
  if (!me) return { ...base, text: name };
  if (arrived === undefined && haversineM(me, stop) < ARRIVED_WITHIN_M) return { ...base, arrived: true, text: t('stop.arrived') };
  const rem = remaining ?? remainingToStop(me, stop, route);
  const km = formatDistance(rem.distanceM);
  if (rem.approximate || rem.durationS === null) {
    const distance = t('stop.cardDistanceApprox', { km });
    return { ...base, approximate: true, distance, km, text: t('stop.chipLine', { name, rest: distance }) };
  }
  const eta = formatDuration(rem.durationS * 1000);
  return {
    ...base,
    distance: km,
    km,
    eta,
    text: t('stop.chipLine', { name, rest: t('stop.cardDistanceEta', { km, eta }) }),
  };
}

/** Screen-reader label for the card: no glyphs, no "≈" symbol read out. */
export function stopCardA11y(parts: StopCardParts, suggestedBy: string | null): string {
  const suggested = suggestedBy ? ` ${t('stop.suggestedBy', { name: suggestedBy })}.` : '';
  if (parts.arrived) return t('stop.a11yCardArrived', { name: parts.name }) + suggested;
  // Raw km, never the "≈" glyph: approximate reads "about 3.4 km".
  const distance = parts.km && parts.approximate ? t('stop.a11yApprox', { km: parts.km }) : parts.km;
  const details = [distance, parts.eta].filter(Boolean).join(', ');
  const label = details
    ? t('stop.a11yCardParts', { name: parts.name, details })
    : t('stop.a11yCardName', { name: parts.name });
  return label + suggested;
}
