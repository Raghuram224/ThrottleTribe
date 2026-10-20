// Pure logic of the `geo` Edge Function (docs/design/24-free-osm-stack.md section 5): input validation, upstream URLs,
// result normalisation, cap tables and error mapping. No Deno APIs and no imports, so Jest tests it from the app repo
// and index.ts stays thin glue. Never log or return anything derived from coordinates or text.

// ---------------------------------------------------------------- caps (section 5.2)

/**
 * App-wide caps, set below the providers' free quotas so overage is never charged. LocationIQ's second cap is 1 (not
 * its limit of 2) and minute 50 (not 60): the counters use fixed windows, so two requests either side of a second
 * boundary could otherwise land inside one real second.
 */
export const CAPS = {
  geoapify: { day: 2800, second: 4 },
  locationiq: { day: 4800, minute: 50, second: 1 },
  user: {
    search: { minute: 30, day: 400 },
    route: { minute: 12, day: 200 },
  },
  /** Anonymous sign-ins are free to create, so each gets half the per-rider caps. */
  anonymousFactor: 0.5,
  /** Per network address (hashed): a second line of defence against many anonymous accounts from one place. */
  ip: {
    search: { minute: 60, day: 600 },
    route: { minute: 20, day: 300 },
  },
} as const;

export type Scope = 'second' | 'minute' | 'day' | 'user';

export interface UsageCheck {
  bucket: string;
  window: 'second' | 'minute' | 'day';
  limit: number;
  /** What the client is told when this bucket is the full one. */
  scope: Scope;
}

export type Op = 'autocomplete' | 'places' | 'route';

export interface Caller {
  /** HMAC of the rider id, never the id. */
  userHash: string;
  /** HMAC of the first forwarded address; null when the platform gave none. */
  ipHash: string | null;
  /** `is_anonymous` claim: an anonymous session. */
  anonymous: boolean;
}

/**
 * Buckets a request must take from, in the order they are checked: the rider's own, then the address's (so a greedy
 * rider or address is told `user` rather than eating the shared budget), then the app-wide second, minute and day.
 */
export function usageChecks(op: Op, caller: Caller): UsageCheck[] {
  const kind = op === 'route' ? 'route' : 'search';
  const factor = caller.anonymous ? CAPS.anonymousFactor : 1;
  const u = CAPS.user[kind];
  const checks: UsageCheck[] = [
    { bucket: `u:${caller.userHash}:${kind}:min`, window: 'minute', limit: Math.max(1, Math.floor(u.minute * factor)), scope: 'user' },
    { bucket: `u:${caller.userHash}:${kind}:day`, window: 'day', limit: Math.max(1, Math.floor(u.day * factor)), scope: 'user' },
  ];
  if (caller.ipHash) {
    const ip = CAPS.ip[kind];
    checks.push(
      { bucket: `ip:${caller.ipHash}:${kind}:min`, window: 'minute', limit: ip.minute, scope: 'user' },
      { bucket: `ip:${caller.ipHash}:${kind}:day`, window: 'day', limit: ip.day, scope: 'user' },
    );
  }
  if (op === 'route') {
    checks.push(
      { bucket: 'liq:sec', window: 'second', limit: CAPS.locationiq.second, scope: 'second' },
      { bucket: 'liq:min', window: 'minute', limit: CAPS.locationiq.minute, scope: 'minute' },
      { bucket: 'liq:day', window: 'day', limit: CAPS.locationiq.day, scope: 'day' },
    );
  } else {
    checks.push(
      { bucket: 'geoapify:sec', window: 'second', limit: CAPS.geoapify.second, scope: 'second' },
      { bucket: 'geoapify:day', window: 'day', limit: CAPS.geoapify.day, scope: 'day' },
    );
  }
  return checks;
}

/** What `geo_take` answered, as the handler acts on it. */
export type TakeResult =
  | { kind: 'ok' }
  | { kind: 'full'; check: UsageCheck; retryAfterS: number }
  | { kind: 'unavailable' };

/**
 * Reads `geo_take`'s result (0 = charged, n = the n-th bucket is full) against the checks sent. Anything else, an RPC
 * error included, is `unavailable`: refuse rather than risk the quota, but say so distinctly (it is not "no key").
 */
export function interpretTake(rpcError: unknown, data: unknown, checks: readonly UsageCheck[], nowMs: number): TakeResult {
  if (rpcError || typeof data !== 'number' || !Number.isInteger(data) || data < 0) return { kind: 'unavailable' };
  if (data === 0) return { kind: 'ok' };
  const check = checks[data - 1];
  return check ? { kind: 'full', check, retryAfterS: retryAfterS(check, nowMs) } : { kind: 'unavailable' };
}

/** The HTTP answer for a take that did not succeed; null when it did. */
export function takeFailureResponse(t: TakeResult): { status: number; body: Record<string, unknown> } | null {
  if (t.kind === 'ok') return null;
  if (t.kind === 'unavailable') return { status: 503, body: { error: 'counters_unavailable' } };
  return { status: 429, body: { error: 'rate_limited', scope: t.check.scope, retryAfterS: t.retryAfterS } };
}

/** First hop of `x-forwarded-for` (the client), trimmed; null when absent. */
export function firstForwardedFor(header: string | null | undefined): string | null {
  const first = (header ?? '').split(',')[0]?.trim();
  return first ? first : null;
}

/** Start of the counter window containing `nowMs` (UTC), as an ISO string for Postgres. */
export function windowStart(nowMs: number, window: UsageCheck['window']): string {
  const size = window === 'second' ? 1000 : window === 'minute' ? 60_000 : 86_400_000;
  return new Date(Math.floor(nowMs / size) * size).toISOString();
}

/** Seconds until the full bucket frees up (section 5.2): second 1, minute to the next minute, day to UTC midnight. */
export function retryAfterS(check: UsageCheck, nowMs: number): number {
  if (check.window === 'second') return 1;
  const size = check.window === 'minute' ? 60_000 : 86_400_000;
  const left = size - (nowMs % size);
  return Math.max(1, Math.ceil(left / 1000));
}

// ---------------------------------------------------------------- input validation

export interface Near {
  lat: number;
  lng: number;
}

export type ParsedRequest =
  | { op: 'autocomplete'; text: string; near: Near | null; limit: number }
  | { op: 'places'; categories: string; near: Near; radiusM: 5000 | 25000; limit: number }
  | { op: 'route'; from: Near; to: Near; steps: boolean; bearingDeg: number | null };

/** The only category lists the chips may ask for; anything else is a bad request (no open-ended Places queries). */
export const ALLOWED_CATEGORIES: readonly string[] = [
  'catering.cafe',
  'service.vehicle.fuel',
  'catering.restaurant',
  'catering.fast_food',
  'parking.cars',
  'parking.motorcycle',
  'parking',
  'amenity.toilet',
];

export const MAX_TEXT_CHARS = 100;
export const MIN_TEXT_CHARS = 3;
export const AUTOCOMPLETE_LIMIT = 8;
export const PLACES_LIMIT = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function point(v: unknown): Near | null {
  if (!isObj(v)) return null;
  const { lat, lng } = v;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const round = (n: number, dp: number) => Number(n.toFixed(dp));

/** Validates and normalises a request body; null = 400 bad_request. Positions are re-rounded server-side. */
export function parseRequest(body: unknown): ParsedRequest | null {
  if (!isObj(body)) return null;
  if (body.op === 'autocomplete') {
    if (typeof body.text !== 'string') return null;
    const text = body.text.trim().replace(/\s+/g, ' ');
    const chars = Array.from(text).length;
    if (chars < MIN_TEXT_CHARS || chars > MAX_TEXT_CHARS) return null;
    let near: Near | null = null;
    if (body.near !== undefined && body.near !== null) {
      const p = point(body.near);
      if (!p) return null;
      near = { lat: round(p.lat, 2), lng: round(p.lng, 2) };
    }
    return { op: 'autocomplete', text, near, limit: AUTOCOMPLETE_LIMIT };
  }
  if (body.op === 'places') {
    if (typeof body.categories !== 'string') return null;
    const cats = body.categories.split(',');
    if (cats.length < 1 || cats.length > 4 || !cats.every((c) => ALLOWED_CATEGORIES.includes(c))) return null;
    const p = point(body.near);
    if (!p) return null;
    if (body.radiusM !== 5000 && body.radiusM !== 25000) return null;
    return {
      op: 'places',
      categories: cats.join(','),
      near: { lat: round(p.lat, 3), lng: round(p.lng, 3) },
      radiusM: body.radiusM,
      limit: PLACES_LIMIT,
    };
  }
  if (body.op === 'route') {
    const from = point(body.from);
    const to = point(body.to);
    if (!from || !to) return null;
    if (body.steps !== undefined && typeof body.steps !== 'boolean') return null;
    let bearingDeg: number | null = null;
    if (body.bearingDeg !== undefined && body.bearingDeg !== null) {
      if (typeof body.bearingDeg !== 'number' || !Number.isFinite(body.bearingDeg)) return null;
      bearingDeg = Math.round(((body.bearingDeg % 360) + 360) % 360) % 360;
    }
    return { op: 'route', from, to, steps: body.steps === true, bearingDeg };
  }
  return null;
}

// ---------------------------------------------------------------- upstream URLs

export const GEOAPIFY_BASE = 'https://api.geoapify.com';

/** The caller appends nothing: the key is part of the returned URL, so never log it. */
export function geoapifyUrl(req: Extract<ParsedRequest, { op: 'autocomplete' | 'places' }>, key: string): string {
  const q = new URLSearchParams();
  if (req.op === 'autocomplete') {
    q.set('text', req.text);
    if (req.near) q.set('bias', `proximity:${req.near.lng},${req.near.lat}`);
    q.set('limit', String(req.limit));
    q.set('lang', 'en');
    q.set('format', 'json');
    q.set('apiKey', key);
    return `${GEOAPIFY_BASE}/v1/geocode/autocomplete?${q.toString()}`;
  }
  q.set('categories', req.categories);
  q.set('filter', `circle:${req.near.lng},${req.near.lat},${req.radiusM}`);
  q.set('bias', `proximity:${req.near.lng},${req.near.lat}`);
  q.set('limit', String(req.limit));
  q.set('lang', 'en');
  q.set('apiKey', key);
  // URLSearchParams escapes `:` and `,`; Geoapify accepts both, but keep the readable form.
  return `${GEOAPIFY_BASE}/v2/places?${q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')}`;
}

export function locationIqUrl(req: Extract<ParsedRequest, { op: 'route' }>, key: string, region: string): string {
  const q = new URLSearchParams({ key, overview: 'full', geometries: 'geojson', steps: String(req.steps) });
  const url = `https://${region}.locationiq.com/v1/directions/driving/${req.from.lng},${req.from.lat};${req.to.lng},${req.to.lat}`;
  // `bearings` is value,range per waypoint; the destination is unconstrained (an empty pair).
  const bearings = req.bearingDeg !== null ? `&bearings=${req.bearingDeg},45;` : '';
  return `${url}?${q.toString()}${bearings}`;
}

/** Region is operator config, but it ends up in a hostname: accept only a short lowercase label. */
export function safeRegion(v: string | undefined | null): string {
  return v && /^[a-z]{2,4}[0-9]{1,2}$/.test(v) ? v : 'us1';
}

// ---------------------------------------------------------------- results

export interface PlaceDTO {
  id: string;
  /** The place's own name; empty for an unnamed place (chips drop those, typed search shows `label`). */
  name: string;
  /** Geoapify's `address_line1`: the name, or the street for an address. */
  label: string;
  street: string;
  housenumber: string;
  city: string;
  lat: number;
  lng: number;
  categories: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Normalises Geoapify Autocomplete (`format=json`: `results[]`) and Places (GeoJSON: `features[].properties`) to one
 * shape. Unusable rows (no point, no name) are dropped. Tolerant on purpose: both shapes, `categories` or `category`.
 */
export function mapGeoapifyPlaces(json: unknown): PlaceDTO[] {
  if (!isObj(json)) return [];
  const rows: Record<string, unknown>[] = [];
  if (Array.isArray(json.results)) {
    for (const r of json.results) if (isObj(r)) rows.push(r);
  } else if (Array.isArray(json.features)) {
    for (const f of json.features) {
      if (!isObj(f) || !isObj(f.properties)) continue;
      const row: Record<string, unknown> = { ...f.properties };
      // A feature's own geometry wins over a missing lat/lon property.
      const c = isObj(f.geometry) && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
      if (c && (typeof row.lat !== 'number' || typeof row.lon !== 'number')) {
        row.lon = c[0];
        row.lat = c[1];
      }
      rows.push(row);
    }
  }
  const out: PlaceDTO[] = [];
  for (const r of rows) {
    const lat = r.lat;
    const lng = r.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const street = str(r.street);
    const housenumber = str(r.housenumber);
    const name = str(r.name);
    const label = str(r.address_line1);
    if (!name && !label && !street) continue;
    const city = str(r.city) || str(r.suburb) || str(r.district) || str(r.county) || str(r.state);
    const categories = Array.isArray(r.categories)
      ? r.categories.filter((c): c is string => typeof c === 'string')
      : str(r.category)
        ? [str(r.category)]
        : [];
    const placeId = str(r.place_id);
    out.push({
      id: placeId || `${lat.toFixed(6)},${lng.toFixed(6)}`,
      name,
      label,
      street,
      housenumber,
      city,
      lat,
      lng,
      categories,
    });
  }
  return out;
}

// ---------------------------------------------------------------- upstream errors

/**
 * LocationIQ's 429 bodies say "Rate Limited Second" / "Rate Limited Minute" / "Rate Limited Day" (documented messages;
 * matched loosely). Unknown wording is treated as the minute limit: a short, safe wait.
 */
export function locationIqScope(body: unknown): 'second' | 'minute' | 'day' {
  const text = isObj(body) ? `${str(body.error)} ${str(body.message)}`.toLowerCase() : typeof body === 'string' ? body.toLowerCase() : '';
  if (/\bday\b|daily/.test(text)) return 'day';
  if (/\bsecond\b/.test(text)) return 'second';
  return 'minute';
}

/**
 * LocationIQ answers 401/403 for a bad or disabled key and 404 for "no route"; the OSRM body then says
 * `NoRoute`. Everything else that is not 2xx is an upstream failure (502).
 */
export function routeStatus(upstream: number, body: unknown): 'ok' | 'no_route' | 'rate_limited' | 'upstream' {
  if (upstream === 429) return 'rate_limited';
  const code = isObj(body) ? body.code : undefined;
  if (code === 'NoRoute') return 'no_route';
  if (upstream >= 200 && upstream < 300) return 'ok';
  return 'upstream';
}
