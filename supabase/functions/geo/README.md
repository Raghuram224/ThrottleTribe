# `geo` Edge Function

Proxy for place search (Geoapify) and routing (LocationIQ) so the app holds no API key (docs/design/24 section 5).
Counters for the free-quota caps live in Postgres (`supabase/migrations/0011_geo_usage.sql`).

## Set up (you run these; nothing here is deployed automatically)

```bash
# 1. Counters (SQL Editor, or `supabase db push`)
#    run supabase/migrations/0011_geo_usage.sql

# 2. Secrets (never commit them, never prefix with EXPO_PUBLIC_)
supabase secrets set GEOAPIFY_KEY=<geoapify api key> LOCATIONIQ_KEY=<locationiq access token>
supabase secrets set GEO_HASH_SECRET=$(openssl rand -hex 32)   # keys the HMAC of rider ids and addresses in the counters
supabase secrets set LOCATIONIQ_REGION=us1     # optional: us1 (default) or eu1, nearest the Supabase region

# 3. Deploy with JWT verification ON (the default; do not pass --no-verify-jwt)
supabase functions deploy geo
```

Local: put the same names in `supabase/functions/.env` and run `supabase functions serve geo`.

`GEO_HASH_SECRET` is used for an HMAC-SHA-256 of the rider id and the first `x-forwarded-for` hop before they reach the
counters table. If it is unset the function falls back to plain SHA-256 and logs a one-time warning: set it.

Either provider key missing = that half answers `503 { error: 'not_configured' }` and the app falls back (search:
Photon; routing: the OSRM URL only in a dev build or with `EXPO_PUBLIC_ROUTING_DEMO_FALLBACK=1`, otherwise a failed
route that keeps the last line). Counters missing or failing answers `503 { error: 'counters_unavailable' }`, which the
app treats as a plain failure (never as "not configured").

## Caps (logic.ts `CAPS`)

| Provider | App-wide | Per rider (anonymous: half) | Per address (hashed) |
|---|---|---|---|
| Geoapify | 2,800 / UTC day, 4 / s | 30 / min, 400 / day | 60 / min, 600 / day |
| LocationIQ | 4,800 / UTC day, 50 / min, 1 / s (waits up to 1 s for a slot) | 12 / min, 200 / day | 20 / min, 300 / day |

LocationIQ's own limits are 5,000 / day, 60 / min, 2 / s. Counters use fixed windows, so two requests either side of a
boundary can fall in one real second: hence 1 / s and 50 / min.

## Contract

`POST /functions/v1/geo`, `Authorization: Bearer <session access token>` (signed-in or anonymous), JSON body:

| `op` | Body | 200 |
|---|---|---|
| `autocomplete` | `{ text (3..100 chars), near?: {lat,lng} }` | `{ provider: 'geoapify', places }` |
| `places` | `{ categories, near: {lat,lng}, radiusM: 5000 \| 25000 }` | `{ provider: 'geoapify', places }` |
| `route` | `{ from, to, steps?, bearingDeg? }` | LocationIQ OSRM-shaped JSON as is |

Errors: `400 bad_request`, `401 unauthorized`, `429 rate_limited { scope, retryAfterS }` (`scope: 'day'` = quota used up),
`502 upstream`, `504 timeout`, `503 not_configured`.

Anonymous sign-ins are free to create, so turn on Supabase Auth's anonymous sign-in rate limit (Authentication >
Rate Limits) and CAPTCHA / Turnstile for anonymous sign-ins; the per-rider and per-address caps here are the second line.

## Checks

- Unit tests: `npx jest supabase/functions/geo` (pure `logic.ts`).
- SQL test (pgTAP): `supabase test db` runs `supabase/tests/geo_usage.test.sql` (a full bucket returns its index and earlier
  buckets roll back).
- Type check of the function (needs Deno, optional): `deno check supabase/functions/geo/index.ts`.
- The `npm:@supabase/supabase-js` import is pinned to an exact version in `index.ts`; bump it on purpose and re-check.

Logs hold op, provider, status and latency only. Never coordinates, text, names or rider ids (rider ids are hashed
before they reach the counters table).
