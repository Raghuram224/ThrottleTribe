// Place search for the shared next stop and "Where to?" (docs/design/19, 24 §2). Geoapify through the `geo` Edge
// Function first, Photon (OpenStreetMap, free, keyless) straight from the phone as the automatic fallback.
// Pure parsing/ranking/chain logic plus the fetch wrappers; no React.
import { fill, copy, spokenDistance } from '@/lib/copy';
import type { IconName } from '@/lib/icon-names';
import { formatDistance } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';
import { createOncePerWindow, geoCall, type GeoFailure, type GeoOutcome, type GeoRequest } from '@/lib/geo-api';

export type PlaceCategory = 'cafe' | 'fuel' | 'restaurant' | 'parking' | 'toilets' | 'other';

/** Who answered a search; the credit line names it (24 §2.4). Recents saved before Geoapify were Photon. */
export type PlaceSource = 'geoapify' | 'photon';

export interface Place {
  /** `g:<place_id>` (Geoapify) or `p:<osm_type><osm_id>` (Photon). */
  id: string;
  name: string;
  /** "Street, City"; empty when the provider has neither. */
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  source: PlaceSource;
  /** Straight-line metres from the rider; null when their position is unknown. */
  distanceM: number | null;
}

export interface SearchChip {
  key: 'coffee' | 'fuel' | 'food' | 'parking' | 'toilets';
  /** Icon from the app's own set (emoji look different on every phone maker's font). */
  icon: IconName;
  /** copy.ts key of the chip label. */
  labelKey: 'search.chipCoffee' | 'search.chipFuel' | 'search.chipFood' | 'search.chipParking' | 'search.chipToilets';
  /** Photon `osm_tag` filter. */
  osmTag: string;
  /** Geoapify Places `categories` (comma list). */
  categories: string;
  /** Photon needs a `q` even with a tag filter; this word matches names of that kind of place. */
  query: string;
}

export const SEARCH_CHIPS: readonly SearchChip[] = [
  { key: 'coffee', icon: 'coffee', labelKey: 'search.chipCoffee', osmTag: 'amenity:cafe', categories: 'catering.cafe', query: 'cafe' },
  { key: 'fuel', icon: 'fuel', labelKey: 'search.chipFuel', osmTag: 'amenity:fuel', categories: 'service.vehicle.fuel', query: 'petrol' },
  { key: 'food', icon: 'food', labelKey: 'search.chipFood', osmTag: 'amenity:restaurant', categories: 'catering.restaurant,catering.fast_food', query: 'restaurant' },
  { key: 'parking', icon: 'parking', labelKey: 'search.chipParking', osmTag: 'amenity:parking', categories: 'parking.cars,parking.motorcycle', query: 'parking' },
  { key: 'toilets', icon: 'toilets', labelKey: 'search.chipToilets', osmTag: 'amenity:toilets', categories: 'amenity.toilet', query: 'toilet' },
];

/** Why a search failed, for the error copy: no network, the providers are limited, or the phone is online but they are slow. */
export type SearchErrorKind = 'offline' | 'busy' | 'slow';

/** The phone's own connection decides "offline"; a timeout or a bad answer while online is "slow", never "needs a connection". */
export function searchErrorKind(e: unknown, offline: boolean): SearchErrorKind {
  if (offline) return 'offline';
  return e instanceof PlaceSearchError && e.code === 'busy' ? 'busy' : 'slow';
}

export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const SEARCH_LIMIT = 8;
/** Photon asks for more on a chip so the 10 nearest can be picked after sorting. */
export const CHIP_FETCH_LIMIT = 20;
/** Photon: up to 6 s. The `geo` function: 4 s, then the same request goes to Photon (24 §2.1). */
export const SEARCH_TIMEOUT_MS = 6000;
export const GEO_SEARCH_TIMEOUT_MS = 4000;
/** Chips: first 5 km; fewer than 3 named places widens once to 25 km; the nearest 10 are shown (24 §2.3). */
export const CHIP_RADIUS_M = 5000;
export const CHIP_WIDE_RADIUS_M = 25_000;
export const CHIP_MIN_RESULTS = 3;
export const CHIP_SHOWN = 10;
export const SEARCH_MIN_CHARS = 3;
export const SEARCH_CACHE_SIZE = 20;

// ---------------------------------------------------------------- parsing

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function categoryOf(key: string, value: string): PlaceCategory {
  if (key !== 'amenity') return 'other';
  if (value === 'cafe') return 'cafe';
  if (value === 'fuel') return 'fuel';
  if (value === 'restaurant' || value === 'fast_food' || value === 'food_court') return 'restaurant';
  if (value === 'parking') return 'parking';
  if (value === 'toilets') return 'toilets';
  return 'other';
}

/** Parses a Photon FeatureCollection; skips features without a usable point or name. */
export function parsePhotonResponse(json: unknown, me?: LatLng | null): Place[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: Place[] = [];
  for (const f of features as PhotonFeature[]) {
    const coords = f?.geometry?.coordinates;
    const props = f?.properties ?? {};
    if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;
    const [lng, lat] = coords as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const street = [str(props.street), str(props.housenumber)].filter(Boolean).join(' ');
    const name = str(props.name) || street;
    if (!name) continue;
    const city = str(props.city) || str(props.locality) || str(props.district) || str(props.county);
    const address = [street, city].filter((p) => p && p !== name).join(', ');
    const osmType = str(props.osm_type);
    const osmId = props.osm_id;
    out.push({
      id: osmType && osmId !== undefined ? `p:${osmType}${String(osmId)}` : `p:${lat.toFixed(6)},${lng.toFixed(6)}`,
      name,
      address,
      lat,
      lng,
      category: categoryOf(str(props.osm_key), str(props.osm_value)),
      source: 'photon',
      distanceM: me ? haversineM(me, { lat, lng }) : null,
    });
  }
  return out;
}

/** Nearest first; places without a distance keep their relative order at the end. */
export function sortByDistance(places: readonly Place[]): Place[] {
  return places
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const da = a.p.distanceM ?? Number.POSITIVE_INFINITY;
      const db = b.p.distanceM ?? Number.POSITIVE_INFINITY;
      return da === db ? a.i - b.i : da - db;
    })
    .map((x) => x.p);
}

// ---------------------------------------------------------------- Geoapify (through the geo function)

const GEOAPIFY_PREFIXES: readonly [string, PlaceCategory][] = [
  ['catering.cafe', 'cafe'],
  ['service.vehicle.fuel', 'fuel'],
  ['commercial.gas', 'fuel'],
  ['catering.restaurant', 'restaurant'],
  ['catering.fast_food', 'restaurant'],
  ['catering.food_court', 'restaurant'],
  ['parking', 'parking'],
  ['amenity.toilet', 'toilets'],
];

/** Our category from Geoapify's dotted `categories` (24 §2.4); the first match wins, else `other`. */
export function geoapifyCategoryOf(categories: readonly string[]): PlaceCategory {
  for (const c of categories) {
    const hit = GEOAPIFY_PREFIXES.find(([prefix]) => c === prefix || c.startsWith(`${prefix}.`));
    if (hit) return hit[1];
  }
  return 'other';
}

/**
 * Maps the function's `{ provider: 'geoapify', places }` to our Place. null = the answer is not that shape (the
 * caller treats it like an upstream failure). Unusable rows are skipped. `requireName` (chips) also drops places that
 * only have an address line: "drop unnamed places" (24 §2.3).
 */
export function parseGeoapifyPlaces(data: unknown, me?: LatLng | null, opts: { requireName?: boolean } = {}): Place[] | null {
  const list = (data as { places?: unknown } | null)?.places;
  if (!Array.isArray(list)) return null;
  const out: Place[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const lat = d.lat;
    const lng = d.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const street = [str(d.street), str(d.housenumber)].filter(Boolean).join(' ');
    const own = str(d.name);
    if (opts.requireName && !own) continue;
    const name = own || str(d.label) || street;
    if (!name) continue;
    const city = str(d.city);
    const address = [street, city].filter((p) => p && p !== name).join(', ');
    const id = str(d.id);
    out.push({
      id: `g:${id || `${lat.toFixed(6)},${lng.toFixed(6)}`}`,
      name,
      address,
      lat,
      lng,
      category: geoapifyCategoryOf(Array.isArray(d.categories) ? d.categories.filter((c): c is string => typeof c === 'string') : []),
      source: 'geoapify',
      distanceM: me ? haversineM(me, { lat, lng }) : null,
    });
  }
  return out;
}

/** Chip results: nearest first by the exact fix, optionally nothing beyond `maxM`, at most the nearest 10. */
export function rankChipPlaces(places: readonly Place[], maxM?: number): Place[] {
  const within = maxM === undefined ? [...places] : places.filter((p) => p.distanceM === null || p.distanceM <= maxM);
  return sortByDistance(within).slice(0, CHIP_SHOWN);
}

/** True when a chip's first (5 km) set is too thin and the search should widen once to 25 km. */
export function needsWiden(namedCount: number): boolean {
  return namedCount < CHIP_MIN_RESULTS;
}

// ---------------------------------------------------------------- provider chain state (24 §2.1)

/** In memory only. `stickyUntil`: until then every search goes straight to Photon. */
export interface ProviderState {
  stickyUntil: number;
}
export const STICKY_QUOTA_MS = 30 * 60_000;
export const STICKY_UNREACHABLE_MS = 5 * 60_000;
export const STICKY_RATE_MIN_MS = 60_000;
export const FALLBACK_TELEMETRY_WINDOW_MS = 10 * 60_000;

export type FallbackReason = 'rate_limited' | 'quota' | 'error' | 'timeout' | 'unreachable';

export const shouldTryGeoapify = (s: ProviderState, now: number): boolean => now >= s.stickyUntil;

/** Why a Geoapify attempt fell back to Photon (telemetry); null when the caller just cancelled. */
export function fallbackReasonOf(f: GeoFailure): FallbackReason | null {
  switch (f.kind) {
    case 'aborted':
      return null;
    case 'rate_limited':
      return f.scope === 'day' ? 'quota' : 'rate_limited';
    case 'timeout':
      return 'timeout';
    case 'unreachable':
      return 'unreachable';
    default:
      return 'error';
  }
}

/**
 * How long Photon stays the only provider after this failure: a daily quota 30 min, then one probe goes to the
 * function again. "Not configured" is the same (no key yet: do not ask the function on every keystroke). A per-minute or
 * per-rider limit keeps Photon for `retryAfterS` (60 s at least). A per-second limit, a timeout or a 5xx falls back for
 * that request only.
 */
export function stickyMsFor(f: GeoFailure): number {
  if (f.kind === 'rate_limited' && f.scope === 'day') return STICKY_QUOTA_MS;
  if (f.kind === 'not_configured') return STICKY_QUOTA_MS;
  // A rider (or address) over its own cap, or the app over its minute cap: Photon only for `retryAfterS` (at least 60 s,
  // at most the quota window), so a busy typist does not hit the function on every keystroke.
  if (f.kind === 'rate_limited' && (f.scope === 'user' || f.scope === 'minute')) {
    return Math.min(STICKY_QUOTA_MS, Math.max(STICKY_RATE_MIN_MS, f.retryAfterS * 1000));
  }
  return 0;
}

// ---------------------------------------------------------------- cache

/** Tiny LRU (Map keeps insertion order): a hit moves the key to the newest end. */
export function createLruCache<V>(max: number) {
  const map = new Map<string, V>();
  return {
    get(key: string): V | undefined {
      if (!map.has(key)) return undefined;
      const v = map.get(key) as V;
      map.delete(key);
      map.set(key, v);
      return v;
    },
    set(key: string, value: V): void {
      map.delete(key);
      map.set(key, value);
      if (map.size > max) map.delete(map.keys().next().value as string);
    },
    get size(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
  };
}

/** One answered search: the rows, who answered, and (chips) the radius the caption names. */
export interface SearchOutcome {
  places: Place[];
  provider: PlaceSource;
  /** Chip searches: 5000 or 25000 (Photon: 25000). null for typed search. */
  radiusM: number | null;
}

/** Keyed without the provider; a hit keeps the provider it came from (for the credit). */
const cache = createLruCache<SearchOutcome>(SEARCH_CACHE_SIZE);
const providerState: ProviderState = { stickyUntil: 0 };

/** Test helper. */
export function clearPlaceSearchCache(): void {
  cache.clear();
  providerState.stickyUntil = 0;
}

// ---------------------------------------------------------------- request

export interface SearchRequest {
  /** Typed text, or the chip's `query`. */
  query: string;
  /** Chip filter (Photon); also switches the order to nearest first. */
  osmTag?: string;
  /** Chip categories (Geoapify Places). */
  categories?: string;
  /** My last position: location bias and the distance shown. */
  me?: LatLng | null;
}

const isChip = (req: SearchRequest): boolean => !!(req.osmTag || req.categories);

export function buildPhotonUrl(req: SearchRequest): string {
  const params = new URLSearchParams({
    q: req.query.trim(),
    limit: String(req.osmTag ? CHIP_FETCH_LIMIT : SEARCH_LIMIT),
    lang: 'en',
  });
  if (req.me) {
    // Rounded to 2 decimals (about 1 km): enough to bias results, not a precise location (21 §5.6).
    params.set('lat', req.me.lat.toFixed(2));
    params.set('lon', req.me.lng.toFixed(2));
  }
  // URLSearchParams would encode the colon of the tag; Photon accepts both but keep it readable.
  if (req.osmTag) params.set('osm_tag', req.osmTag);
  return `${PHOTON_URL}?${params.toString().replace(/%3A/g, ':')}`;
}

/** `busy` = the provider said 429 / quota; the others are plain failures. */
export type PlaceSearchErrorCode = 'network' | 'timeout' | 'bad_response' | 'busy';

export class PlaceSearchError extends Error {
  readonly code: PlaceSearchErrorCode;
  constructor(code: PlaceSearchErrorCode) {
    super(code);
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}

const cacheKey = (req: SearchRequest) =>
  [req.query.trim().toLowerCase(), req.osmTag ?? '', req.me ? `${req.me.lat.toFixed(2)},${req.me.lng.toFixed(2)}` : ''].join('|');

const abortError = (): Error => Object.assign(new Error('Aborted'), { name: 'AbortError' });

/** Photon, straight from the phone: 6 s timeout, an HTTP 429 is `busy`. Rejects with a PlaceSearchError or AbortError. */
export async function fetchPhoton(req: SearchRequest, signal?: AbortSignal): Promise<Place[]> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SEARCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(buildPhotonUrl(req), { signal: controller.signal });
    if (res.status === 429) throw new PlaceSearchError('busy');
    if (!res.ok) throw new PlaceSearchError('bad_response');
    return parsePhotonResponse(await res.json(), req.me);
  } catch (e) {
    if (e instanceof PlaceSearchError) throw e;
    if (timedOut) throw new PlaceSearchError('timeout');
    if (signal?.aborted) throw e; // caller cancelled: let it see the AbortError
    throw new PlaceSearchError(e instanceof SyntaxError ? 'bad_response' : 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Telemetry hooks (the root layout wires them; this module stays free of app services). */
export interface SearchReport {
  fallback?: (reason: FallbackReason, kind: 'typed' | 'chip') => void;
  failed?: (reason: 'busy' | 'network', kind: 'typed' | 'chip') => void;
  chipWidened?: (found: boolean) => void;
}
let report: SearchReport = {};
export function setSearchReport(r: SearchReport | null): void {
  report = r ?? {};
}
const fallbackGate = createOncePerWindow(FALLBACK_TELEMETRY_WINDOW_MS);

export interface SearchDeps {
  geo: (req: GeoRequest, o: { timeoutMs: number; signal?: AbortSignal }) => Promise<GeoOutcome>;
  photon: (req: SearchRequest, signal?: AbortSignal) => Promise<Place[]>;
  now: () => number;
  report: SearchReport;
  /** Throttle for the fallback event; tests pass an always-open gate. */
  fallbackGate: (key: string, now: number) => boolean;
}

type GeoSearchResult = { ok: true; outcome: SearchOutcome } | { ok: false; failure: GeoFailure };

async function geoSearch(req: SearchRequest, signal: AbortSignal | undefined, deps: SearchDeps): Promise<GeoSearchResult> {
  const me = req.me ?? null;
  const opts = { timeoutMs: GEO_SEARCH_TIMEOUT_MS, signal };
  if (!isChip(req)) {
    // Position rounded to 2 decimals on the phone (about 1 km, 21 §5.6).
    const near = me ? { lat: Number(me.lat.toFixed(2)), lng: Number(me.lng.toFixed(2)) } : undefined;
    const r = await deps.geo({ op: 'autocomplete', text: req.query.trim(), ...(near ? { near } : {}) }, opts);
    if (!r.ok) return r;
    const places = parseGeoapifyPlaces(r.data, me);
    return places ? { ok: true, outcome: { places, provider: 'geoapify', radiusM: null } } : { ok: false, failure: { kind: 'upstream' } };
  }
  // Chips: a 5 km circle around the position rounded to 3 decimals (about 110 m), widened once to 25 km.
  const near = { lat: Number((me as LatLng).lat.toFixed(3)), lng: Number((me as LatLng).lng.toFixed(3)) };
  const ask = async (radiusM: 5000 | 25000): Promise<{ ok: true; places: Place[] } | { ok: false; failure: GeoFailure }> => {
    const r = await deps.geo({ op: 'places', categories: req.categories as string, near, radiusM }, opts);
    if (!r.ok) return r;
    const places = parseGeoapifyPlaces(r.data, me, { requireName: true });
    return places ? { ok: true, places } : { ok: false, failure: { kind: 'upstream' } };
  };
  const first = await ask(CHIP_RADIUS_M);
  if (!first.ok) return first;
  let places = first.places;
  let radiusM: number = CHIP_RADIUS_M;
  if (needsWiden(places.length)) {
    const second = await ask(CHIP_WIDE_RADIUS_M);
    // A widen that fails keeps the first set (one provider, never mixed).
    if (second.ok) {
      deps.report.chipWidened?.(second.places.length > 0);
      if (second.places.length >= places.length) {
        places = second.places;
        radiusM = CHIP_WIDE_RADIUS_M;
      }
    }
  }
  return { ok: true, outcome: { places: rankChipPlaces(places), provider: 'geoapify', radiusM } };
}

/**
 * The provider chain (24 §2.1): the `geo` function first (unless Photon is sticky), any failure falls back to Photon
 * for the same request. Rejects with a PlaceSearchError (`busy` when a provider said 429 / quota and nothing answered),
 * or an AbortError when `signal` aborts. One result set always comes from one provider.
 */
export async function runSearch(
  req: SearchRequest,
  signal: AbortSignal | undefined,
  deps: SearchDeps,
  state: ProviderState,
): Promise<SearchOutcome> {
  const kind = isChip(req) ? 'chip' : 'typed';
  let geoFailure: GeoFailure | null = null;
  // Chips need a position for the circle; without one Photon (no bias needed) answers directly.
  const canAskGeo = !isChip(req) || !!req.me;
  if (canAskGeo && shouldTryGeoapify(state, deps.now())) {
    const r = await geoSearch(req, signal, deps);
    if (signal?.aborted || (!r.ok && r.failure.kind === 'aborted')) throw abortError();
    if (r.ok) return r.outcome;
    geoFailure = r.failure;
    const until = stickyMsFor(r.failure);
    if (until > 0) state.stickyUntil = Math.max(state.stickyUntil, deps.now() + until);
    const reason = fallbackReasonOf(r.failure);
    if (reason && deps.fallbackGate(`fallback:${reason}`, deps.now())) deps.report.fallback?.(reason, kind);
  }
  try {
    const found = await deps.photon(req, signal);
    // Photon answered while the function could not be reached: stop trying it for 5 minutes.
    if (geoFailure?.kind === 'unreachable') state.stickyUntil = Math.max(state.stickyUntil, deps.now() + STICKY_UNREACHABLE_MS);
    if (!isChip(req)) return { places: found, provider: 'photon', radiusM: null };
    return { places: rankChipPlaces(found, CHIP_WIDE_RADIUS_M), provider: 'photon', radiusM: CHIP_WIDE_RADIUS_M };
  } catch (e) {
    if (!(e instanceof PlaceSearchError)) throw e; // AbortError: the caller cancelled
    const busy = e.code === 'busy' || geoFailure?.kind === 'rate_limited';
    deps.report.failed?.(busy ? 'busy' : 'network', kind);
    throw busy && e.code !== 'busy' ? new PlaceSearchError('busy') : e;
  }
}

/**
 * Runs one search and says who answered. Cached (last 20, distances recomputed for the exact position). See
 * `runSearch` for failures.
 */
export async function searchPlacesDetailed(req: SearchRequest, signal?: AbortSignal): Promise<SearchOutcome> {
  const key = cacheKey(req);
  const hit = cache.get(key);
  if (hit) {
    // Distances depend on the exact position, so recompute them for the cached hit.
    const fresh = req.me ? hit.places.map((p) => ({ ...p, distanceM: haversineM(req.me as LatLng, p) })) : hit.places;
    return { ...hit, places: isChip(req) ? sortByDistance(fresh) : fresh };
  }
  const out = await runSearch(
    req,
    signal,
    {
      geo: geoCall,
      photon: fetchPhoton,
      now: Date.now,
      get report() {
        return report;
      },
      fallbackGate,
    },
    providerState,
  );
  cache.set(key, out);
  return out;
}

/** The rows only (the earlier interface): see `searchPlacesDetailed`. */
export async function searchPlaces(req: SearchRequest, signal?: AbortSignal): Promise<Place[]> {
  return (await searchPlacesDetailed(req, signal)).places;
}

/** Lower-case a-z0-9 only, diacritics stripped, runs of one letter collapsed ("Kallakkurichi" and "Kallakuruchi" meet). */
function normName(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1');
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The address without parts that only repeat the place name (any spelling). '' = no second line (26 H1). Fuzzy matching
 * (a fifth of the shorter name, at least 1) only for names of 4+ letters, so "BP" never swallows "HP".
 */
export function distinctAddress(name: string, address: string): string {
  const n = normName(name);
  if (!n) return address;
  return address
    .split(',')
    .map((p) => p.trim())
    .filter((part) => {
      if (!part) return false;
      const p = normName(part);
      if (p === n) return false;
      const min = Math.min(p.length, n.length);
      return !(min >= 4 && editDistance(p, n) <= Math.max(1, Math.floor(0.2 * min)));
    })
    .join(', ');
}

/**
 * Screen-reader label for a place row: "Mysuru Palace, Sayyaji Rao Rd, 118 kilometres away". Parts that are
 * missing (no address, no position) are left out.
 */
export function placeRowA11y(name: string, address: string, distanceM: number | null): string {
  address = distinctAddress(name, address);
  if (distanceM == null) return address ? `${name}, ${address}` : name;
  const away = spokenDistance(formatDistance(distanceM));
  if (!address) return `${name}, ${away} away`;
  return fill(copy['whereTo.a11yRow'], { name, address, distance: away });
}
