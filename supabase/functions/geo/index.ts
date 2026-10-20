// Edge Function `geo` (Deno): the only place the Geoapify and LocationIQ keys exist (docs/design/24 section 5).
//   POST { op: 'autocomplete' | 'places' | 'route', ... }  ->  see README.md and logic.ts.
// The app never holds a key. Every call needs a signed-in or anonymous Supabase session (verified here, and by the
// platform with `verify_jwt` on, which is the default: do not deploy with --no-verify-jwt).
//
// Answers (explicit, so the app maps them to states):
//   200 { provider: 'geoapify', places: PlaceDTO[] }          search
//   200 <LocationIQ JSON as is>, header x-geo-provider        route (NoRoute is a 200 `{ code: 'NoRoute' }` too)
//   400 { error: 'bad_request' }
//   401 { error: 'unauthorized' }
//   429 { error: 'rate_limited', scope: 'second' | 'minute' | 'day' | 'user', retryAfterS }   (scope 'day' = quota used up)
//   502 { error: 'upstream' }     504 { error: 'timeout' }
//   503 { error: 'not_configured' }       the provider key secret is not set (the only "no key" answer)
//   503 { error: 'counters_unavailable' } the quota counters (migration 0011) are missing or failing: refused, not "no key"
// Logs: op, provider, status, latency only. Never coordinates, text, place names or user ids.
// Pinned: bump on purpose, then run `deno check supabase/functions/geo/index.ts` (see README).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

import {
  firstForwardedFor,
  geoapifyUrl,
  interpretTake,
  locationIqScope,
  locationIqUrl,
  mapGeoapifyPlaces,
  parseRequest,
  retryAfterS,
  routeStatus,
  safeRegion,
  takeFailureResponse,
  usageChecks,
  windowStart,
  type Caller,
  type Op,
  type ParsedRequest,
  type UsageCheck,
} from './logic.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const SEARCH_TIMEOUT_MS = 3500; // the app gives up at 4 s and falls back to Photon
const ROUTE_TIMEOUT_MS = 7000; // the app gives up at 8 s

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', ...extra },
  });
}

/** `SUPABASE_*_KEYS` are JSON dictionaries; fall back to the legacy single-key variables. */
function pickKey(dictVar: string, legacyVar: string): string | undefined {
  try {
    const dict = JSON.parse(Deno.env.get(dictVar) ?? '{}');
    if (dict && typeof dict.default === 'string' && dict.default) return dict.default;
  } catch {
    // Fall through to the legacy variable.
  }
  return Deno.env.get(legacyVar) || undefined;
}

let warnedNoSecret = false;

/**
 * One-way hash for the counters: HMAC-SHA-256 with GEO_HASH_SECRET, so a leaked counters table cannot be matched back to
 * rider ids or addresses. Without the secret it falls back to plain SHA-256 and warns once (set the secret).
 */
async function hashId(text: string): Promise<string> {
  const secret = Deno.env.get('GEO_HASH_SECRET');
  const data = new TextEncoder().encode(text);
  let digest: ArrayBuffer;
  if (secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    digest = await crypto.subtle.sign('HMAC', key, data);
  } else {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(JSON.stringify({ warn: 'GEO_HASH_SECRET is not set; counters use plain SHA-256' }));
    }
    digest = await crypto.subtle.digest('SHA-256', data);
  }
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function log(entry: { op: string; provider: string; status: number; ms: number; note?: string }): void {
  console.log(JSON.stringify(entry));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Charges one unit to every bucket for this request, or to none. */
async function take(admin: ReturnType<typeof createClient>, checks: UsageCheck[], now: number) {
  const { data, error } = await admin.rpc('geo_take', {
    p_buckets: checks.map((c) => c.bucket),
    p_windows: checks.map((c) => windowStart(now, c.window)),
    p_limits: checks.map((c) => c.limit),
    p_cost: 1,
  });
  return interpretTake(error, data, checks, now);
}

async function authenticate(req: Request): Promise<{ sub: string; anonymous: boolean } | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  const url = Deno.env.get('SUPABASE_URL');
  const key = pickKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  if (!token || !url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // getClaims verifies the signature against the project's JWKS (asymmetric keys) or asks Auth (legacy secret).
  const { data, error } = await client.auth.getClaims(token);
  const claims = data?.claims;
  // Anonymous sessions have role `authenticated` too; the bare publishable key (role `anon`) is refused.
  if (error || !claims || claims.role !== 'authenticated' || typeof claims.sub !== 'string') return null;
  return { sub: claims.sub, anonymous: claims.is_anonymous === true };
}

async function fetchUpstream(url: string, timeoutMs: number): Promise<Response | 'timeout' | 'error'> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (e) {
    return e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'error';
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch {
    // Anything unexpected is an upstream failure, still with CORS headers so a browser client can read it. No details.
    console.log(JSON.stringify({ op: 'unknown', provider: 'none', status: 502, ms: 0, note: 'exception' }));
    return json({ error: 'upstream' }, 502);
  }
});

async function handle(req: Request): Promise<Response> {
  const started = Date.now();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 400);

  const who = await authenticate(req);
  if (!who) return json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const parsed: ParsedRequest | null = parseRequest(body);
  if (!parsed) return json({ error: 'bad_request' }, 400);
  const op: Op = parsed.op;
  const provider = op === 'route' ? 'locationiq' : 'geoapify';
  const done = (res: Response, note?: string): Response => {
    log({ op, provider, status: res.status, ms: Date.now() - started, note });
    return res;
  };

  // A missing key is "not configured": the app falls back (Photon for search; routes per the app's fallback flag).
  const key = Deno.env.get(op === 'route' ? 'LOCATIONIQ_KEY' : 'GEOAPIFY_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = pickKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return done(json({ error: 'not_configured' }, 503), 'no_key');
  if (!supabaseUrl || !serviceKey) return done(json({ error: 'counters_unavailable' }, 503), 'no_service_key');

  // Caps first (section 5.2), so a refused request never reaches the provider.
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = firstForwardedFor(req.headers.get('x-forwarded-for'));
  const caller: Caller = { userHash: await hashId(who.sub), ipHash: ip ? await hashId(`ip:${ip}`) : null, anonymous: who.anonymous };
  const checks = usageChecks(op, caller);
  let taken = await take(admin, checks, Date.now());
  // LocationIQ allows 2/s: wait up to one second for a free slot before answering `second`.
  if (taken.kind === 'full' && op === 'route' && taken.check.scope === 'second') {
    await sleep(1000 - (Date.now() % 1000) + 25);
    taken = await take(admin, checks, Date.now());
  }
  const refused = takeFailureResponse(taken);
  if (refused) {
    const extra = refused.status === 429 ? { 'retry-after': String(refused.body.retryAfterS) } : {};
    return done(json(refused.body, refused.status, extra), taken.kind === 'full' ? taken.check.scope : 'no_counters');
  }
  if (parsed.op === 'route') {
    const url = locationIqUrl(parsed, key, safeRegion(Deno.env.get('LOCATIONIQ_REGION')));
    const res = await fetchUpstream(url, ROUTE_TIMEOUT_MS);
    if (res === 'timeout') return done(json({ error: 'timeout' }, 504));
    if (res === 'error') return done(json({ error: 'upstream' }, 502));
    const data = await readJson(res);
    const kind = routeStatus(res.status, data);
    if (kind === 'rate_limited') {
      const scope = locationIqScope(data);
      const retry = retryAfterS({ bucket: '', window: scope === 'second' ? 'second' : scope === 'day' ? 'day' : 'minute', limit: 0, scope }, Date.now());
      return done(json({ error: 'rate_limited', scope, retryAfterS: retry }, 429, { 'retry-after': String(retry) }), scope);
    }
    if (kind === 'upstream' || data === null) return done(json({ error: 'upstream' }, 502), `upstream_${res.status}`);
    // OSRM-shaped JSON unchanged (`NoRoute` included, as a 200), so the app's parser reads it as it always did.
    return done(json(data, 200, { 'x-geo-provider': 'locationiq' }));
  }

  const res = await fetchUpstream(geoapifyUrl(parsed, key), SEARCH_TIMEOUT_MS);
  if (res === 'timeout') return done(json({ error: 'timeout' }, 504));
  if (res === 'error') return done(json({ error: 'upstream' }, 502));
  if (res.status === 429 || res.status === 402) {
    // Geoapify's own limit hit despite our caps: 402 means the plan's quota is gone, 429 a burst.
    const scope = res.status === 402 ? 'day' : 'minute';
    const retry = scope === 'day' ? 1800 : 60;
    return done(json({ error: 'rate_limited', scope, retryAfterS: retry }, 429, { 'retry-after': String(retry) }), `geoapify_${res.status}`);
  }
  if (!res.ok) return done(json({ error: 'upstream' }, 502), `upstream_${res.status}`);
  const data = await readJson(res);
  if (data === null) return done(json({ error: 'upstream' }, 502), 'bad_json');
  return done(json({ provider: 'geoapify', places: mapGeoapifyPlaces(data) }));
}
