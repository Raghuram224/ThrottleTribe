// Photon (OpenStreetMap, free, keyless) place search for the shared next stop (docs/design/19).
// Pure parsing/sorting/cache helpers plus one fetch wrapper; no React.
import { haversineM, type LatLng } from '@/lib/geo';

export type PlaceCategory = 'cafe' | 'fuel' | 'restaurant' | 'parking' | 'toilets' | 'other';

export interface Place {
  id: string;
  name: string;
  /** "Street, City"; empty when Photon has neither. */
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  /** Straight-line metres from the rider; null when their position is unknown. */
  distanceM: number | null;
}

export interface SearchChip {
  key: 'coffee' | 'fuel' | 'food' | 'parking' | 'toilets';
  glyph: string;
  /** copy.ts key of the chip label. */
  labelKey: 'search.chipCoffee' | 'search.chipFuel' | 'search.chipFood' | 'search.chipParking' | 'search.chipToilets';
  /** Photon `osm_tag` filter. */
  osmTag: string;
  /** Photon needs a `q` even with a tag filter; this word matches names of that kind of place. */
  query: string;
}

export const SEARCH_CHIPS: readonly SearchChip[] = [
  { key: 'coffee', glyph: '☕', labelKey: 'search.chipCoffee', osmTag: 'amenity:cafe', query: 'cafe' },
  { key: 'fuel', glyph: '⛽', labelKey: 'search.chipFuel', osmTag: 'amenity:fuel', query: 'petrol' },
  { key: 'food', glyph: '🍽', labelKey: 'search.chipFood', osmTag: 'amenity:restaurant', query: 'restaurant' },
  { key: 'parking', glyph: '🅿', labelKey: 'search.chipParking', osmTag: 'amenity:parking', query: 'parking' },
  { key: 'toilets', glyph: '🚻', labelKey: 'search.chipToilets', osmTag: 'amenity:toilets', query: 'toilet' },
];

export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const SEARCH_LIMIT = 8;
export const SEARCH_TIMEOUT_MS = 6000;
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
      id: osmType && osmId !== undefined ? `${osmType}${String(osmId)}` : `${lat.toFixed(6)},${lng.toFixed(6)}`,
      name,
      address,
      lat,
      lng,
      category: categoryOf(str(props.osm_key), str(props.osm_value)),
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

const cache = createLruCache<Place[]>(SEARCH_CACHE_SIZE);

/** Test helper. */
export function clearPlaceSearchCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------- request

export interface SearchRequest {
  /** Typed text, or the chip's `query`. */
  query: string;
  /** Chip filter; also switches the order to nearest first. */
  osmTag?: string;
  /** My last position: location bias and the distance shown. */
  me?: LatLng | null;
}

export function buildPhotonUrl(req: SearchRequest): string {
  const params = new URLSearchParams({ q: req.query.trim(), limit: String(SEARCH_LIMIT), lang: 'en' });
  if (req.me) {
    params.set('lat', req.me.lat.toFixed(5));
    params.set('lon', req.me.lng.toFixed(5));
  }
  // URLSearchParams would encode the colon of the tag; Photon accepts both but keep it readable.
  if (req.osmTag) params.set('osm_tag', req.osmTag);
  return `${PHOTON_URL}?${params.toString().replace(/%3A/g, ':')}`;
}

export type PlaceSearchErrorCode = 'network' | 'timeout' | 'bad_response';

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

/**
 * Runs one search. Rejects with a PlaceSearchError (timeout after 6 s, network, bad response), or an
 * AbortError when `signal` aborts. Results are cached (last 20), distance is relative to `req.me`.
 */
export async function searchPlaces(req: SearchRequest, signal?: AbortSignal): Promise<Place[]> {
  const key = cacheKey(req);
  const hit = cache.get(key);
  if (hit) {
    // Distances depend on the exact position, so recompute them for the cached hit.
    const fresh = req.me ? hit.map((p) => ({ ...p, distanceM: haversineM(req.me as LatLng, p) })) : hit;
    return req.osmTag ? sortByDistance(fresh) : fresh;
  }

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
    if (!res.ok) throw new PlaceSearchError('bad_response');
    const places = parsePhotonResponse(await res.json(), req.me);
    cache.set(key, places);
    return req.osmTag ? sortByDistance(places) : places;
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
