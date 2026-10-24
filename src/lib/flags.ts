// Build-time flags from EXPO_PUBLIC_* env vars. Expo inlines `process.env.EXPO_PUBLIC_X` only when
// it is written out literally, so each variable is read in full here and nowhere else.
import { parseDemProvider, type DemProvider } from '@/lib/dem';

/**
 * Phone sign-in needs an SMS provider in Supabase (cost). Off unless EXPO_PUBLIC_PHONE_AUTH=1.
 * Note: docs/design/12 calls this flag EXPO_PUBLIC_PHONE_OTP; the code and .env.example use PHONE_AUTH.
 */
export const PHONE_AUTH_ENABLED = process.env.EXPO_PUBLIC_PHONE_AUTH === '1';

/**
 * Base of the hosted invite page, e.g. https://join.example.com/j. Empty/unset means invites
 * carry the 6-digit code only (never a broken link).
 */
export const INVITE_BASE_URL: string | null = process.env.EXPO_PUBLIC_INVITE_BASE_URL?.trim() || null;

const ROUTING_URL_ENV = process.env.EXPO_PUBLIC_ROUTING_URL?.trim().replace(/\/+$/, '') || '';

/**
 * Base of the OSRM `route` service, without a trailing slash (21 §3.1). Not a secret: it only lets the
 * team swap the public demo for a self-hosted router without touching the logic. Production routes go through the
 * `geo` Edge Function (LocationIQ, docs/design/24 §3); this URL is the development override and, deviating from
 * spec 24 S10, the fallback while `geo` reports routing is not configured (no LocationIQ key yet).
 */
export const ROUTING_URL: string = ROUTING_URL_ENV || 'https://router.project-osrm.org/route/v1/driving';

/**
 * Development only (spec 24 §3.1): when EXPO_PUBLIC_ROUTING_URL is set in a dev build, every route request goes straight
 * to that server and `geo` is not called. Release builds ignore the variable for this purpose.
 */
export const ROUTING_DIRECT: boolean = __DEV__ && ROUTING_URL_ENV !== '';

/**
 * May routing fall back to the OSRM URL when `geo` says routing is not configured (no LocationIQ key yet)? Only in a dev
 * build, or when EXPO_PUBLIC_ROUTING_DEMO_FALLBACK=1 (an explicit transition choice). In a release build otherwise a
 * not-configured router is a failed route: keep the last line, dashed fallback, retry (24 §3.4). The public demo's policy
 * is non-commercial, so it is never a silent production fallback.
 */
export const ROUTING_FALLBACK_ALLOWED: boolean = __DEV__ || process.env.EXPO_PUBLIC_ROUTING_DEMO_FALLBACK === '1';

/**
 * Development only (spec 24 §5.2): makes the client behave as if `geo` answered a limit, to test the rate-limit
 * states. Ignored in release builds (preview / production profiles).
 */
const SIMULATE_ENV = process.env.EXPO_PUBLIC_GEO_SIMULATE?.trim() ?? '';
export type GeoSimulation = 'search_429' | 'search_quota' | 'route_429_minute' | 'route_429_day';
export const GEO_SIMULATE: GeoSimulation | null =
  __DEV__ && ['search_429', 'search_quota', 'route_429_minute', 'route_429_day'].includes(SIMULATE_ENV)
    ? (SIMULATE_ENV as GeoSimulation)
    : null;

/**
 * Whether the router honours OSRM's `exclude=motorway` (21 D2a). The public demo does not (HTTP 400
 * InvalidValue "Exclude flag combination is not supported."), so this is off unless EXPO_PUBLIC_ROUTING_EXCLUDE=1,
 * which is for a self-hosted router whose profile has motorways to exclude. Off: the app never sends `exclude`
 * and hides the "Allow expressways" switch, since it could not do anything.
 */
export const ROUTING_SUPPORTS_EXCLUDE = process.env.EXPO_PUBLIC_ROUTING_EXCLUDE === '1';

/**
 * Where the Terrain hillshade gets its elevation tiles (docs/design/25 T6): Mapterhorn by default, `aws` for the AWS
 * Terrain Tiles fallback. A JS constant, so switching it ships as an OTA update. Unknown values read as Mapterhorn.
 */
export const DEM_PROVIDER: DemProvider = parseDemProvider(process.env.EXPO_PUBLIC_DEM_PROVIDER?.trim());

/**
 * The live ride runs on Home's one map (docs/design/28 §8): starting or opening a ride never slides to another screen
 * or reloads the map. On by default; EXPO_PUBLIC_LIVE_ON_HOME=0 brings back the separate live screen. Web always keeps
 * the live screen (see `rideOnHome`).
 */
export const LIVE_ON_HOME = process.env.EXPO_PUBLIC_LIVE_ON_HOME?.trim() !== '0';
