// Client of the `geo` Edge Function (docs/design/24 §5): place search (Geoapify) and routes (LocationIQ) behind our
// own server, so the app holds no API key. This module only calls the function and names what went wrong; what to do
// about it (Photon, the OSRM fallback, rate-limit waits) is decided by place-search.ts and nav-route.ts.
// Nothing here logs or stores coordinates or text.
import { GEO_SIMULATE } from '@/lib/flags';
import type { RateScope } from '@/lib/route-limits';

export const GEO_FUNCTION = 'geo';

export type GeoFailure =
  /** No key secret set, the function is not deployed (404), or its counters are missing. */
  | { kind: 'not_configured' }
  | { kind: 'rate_limited'; scope: RateScope; retryAfterS: number }
  | { kind: 'timeout' }
  /** The function or its provider failed (5xx, unreadable answer, bad request, no session). */
  | { kind: 'upstream' }
  /** No network, or the function could not be reached. */
  | { kind: 'unreachable' }
  /** The caller cancelled. */
  | { kind: 'aborted' };

export type GeoOutcome = { ok: true; data: unknown } | { ok: false; failure: GeoFailure };

export type GeoRequest =
  | { op: 'autocomplete'; text: string; near?: { lat: number; lng: number } }
  | { op: 'places'; categories: string; near: { lat: number; lng: number }; radiusM: 5000 | 25000 }
  | { op: 'route'; from: { lat: number; lng: number }; to: { lat: number; lng: number }; steps: boolean; bearingDeg?: number };

/** What one HTTP exchange with the function looked like, whatever carried it. null status = the network failed. */
export interface GeoHttp {
  status: number | null;
  body: unknown;
}

const SCOPES: readonly RateScope[] = ['second', 'minute', 'day', 'user'];

/** Turns the function's HTTP answer into an outcome (the contract in supabase/functions/geo/README.md). Pure. */
export function mapGeoResponse(status: number | null, body: unknown): GeoOutcome {
  if (status === null) return { ok: false, failure: { kind: 'unreachable' } };
  if (status >= 200 && status < 300) return body == null ? { ok: false, failure: { kind: 'upstream' } } : { ok: true, data: body };
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; scope?: unknown; retryAfterS?: unknown };
  // The platform answers 404 for a function that is not deployed (and the relay says so with its own code).
  if (status === 404) return { ok: false, failure: { kind: 'not_configured' } };
  if (status === 503 && b.error === 'not_configured') return { ok: false, failure: { kind: 'not_configured' } };
  if (status === 429) {
    const scope = SCOPES.includes(b.scope as RateScope) ? (b.scope as RateScope) : 'minute';
    const retryAfterS = typeof b.retryAfterS === 'number' && Number.isFinite(b.retryAfterS) ? b.retryAfterS : 60;
    return { ok: false, failure: { kind: 'rate_limited', scope, retryAfterS } };
  }
  if (status === 504 || b.error === 'timeout') return { ok: false, failure: { kind: 'timeout' } };
  return { ok: false, failure: { kind: 'upstream' } };
}

export type GeoTransport = (body: GeoRequest, opts: { signal: AbortSignal; timeoutMs: number }) => Promise<GeoHttp>;

/** Default transport: `supabase.functions.invoke` (adds the session token). Imported lazily so pure tests never load it. */
const supabaseTransport: GeoTransport = async (body, { signal, timeoutMs }) => {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke(GEO_FUNCTION, { body, signal, timeout: timeoutMs });
  if (!error) return { status: 200, body: data };
  // A non-2xx answer carries the Response in `context`; a network failure does not.
  const ctx = (error as { context?: unknown }).context;
  if (ctx && typeof (ctx as Response).status === 'number') {
    const res = ctx as Response;
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // No JSON body: the status alone decides.
    }
    return { status: res.status, body: parsed };
  }
  return { status: null, body: null };
};

let transport: GeoTransport = supabaseTransport;

/** Test seam: swap the HTTP layer. Pass null to restore the default. */
export function setGeoTransport(t: GeoTransport | null): void {
  transport = t ?? supabaseTransport;
}

const simulated = (op: GeoRequest['op']): GeoOutcome | null => {
  const isRoute = op === 'route';
  if (GEO_SIMULATE === 'search_429' && !isRoute) return { ok: false, failure: { kind: 'rate_limited', scope: 'minute', retryAfterS: 60 } };
  if (GEO_SIMULATE === 'search_quota' && !isRoute) return { ok: false, failure: { kind: 'rate_limited', scope: 'day', retryAfterS: 3600 } };
  if (GEO_SIMULATE === 'route_429_minute' && isRoute) return { ok: false, failure: { kind: 'rate_limited', scope: 'minute', retryAfterS: 30 } };
  if (GEO_SIMULATE === 'route_429_day' && isRoute) return { ok: false, failure: { kind: 'rate_limited', scope: 'day', retryAfterS: 3600 } };
  return null;
};

/**
 * One call to `geo`. Never throws. `timeoutMs` ends it as a `timeout` (search 4 s, routes 8 s); `signal` cancels it
 * as `aborted`.
 */
export async function geoCall(req: GeoRequest, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<GeoOutcome> {
  const sim = simulated(req.op);
  if (sim) return sim;
  if (opts.signal?.aborted) return { ok: false, failure: { kind: 'aborted' } };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const http = await transport(req, { signal: controller.signal, timeoutMs: opts.timeoutMs });
    if (opts.signal?.aborted) return { ok: false, failure: { kind: 'aborted' } };
    if (timedOut) return { ok: false, failure: { kind: 'timeout' } };
    return mapGeoResponse(http.status, http.body);
  } catch {
    if (opts.signal?.aborted) return { ok: false, failure: { kind: 'aborted' } };
    return { ok: false, failure: { kind: timedOut ? 'timeout' : 'unreachable' } };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * "At most once per key per window" gate for telemetry (spec 24 §10: 10 min per device). Pure; the clock is passed in.
 */
export function createOncePerWindow(windowMs: number) {
  const last = new Map<string, number>();
  return (key: string, now: number): boolean => {
    const at = last.get(key);
    if (at !== undefined && now - at < windowMs) return false;
    last.set(key, now);
    return true;
  };
}
