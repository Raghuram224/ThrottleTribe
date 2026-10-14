// Build-time flags from EXPO_PUBLIC_* env vars. Expo inlines `process.env.EXPO_PUBLIC_X` only when
// it is written out literally, so each variable is read in full here and nowhere else.

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

/**
 * Base of the OSRM `route` service, without a trailing slash (21 §3.1). Not a secret: it only lets the
 * team swap the public demo for a self-hosted router without touching the logic.
 */
export const ROUTING_URL: string =
  process.env.EXPO_PUBLIC_ROUTING_URL?.trim().replace(/\/+$/, '') || 'https://router.project-osrm.org/route/v1/driving';

/**
 * Whether the router honours OSRM's `exclude=motorway` (21 D2a). The public demo does not (HTTP 400
 * InvalidValue "Exclude flag combination is not supported."), so this is off unless EXPO_PUBLIC_ROUTING_EXCLUDE=1,
 * which is for a self-hosted router whose profile has motorways to exclude. Off: the app never sends `exclude`
 * and hides the "Allow expressways" switch, since it could not do anything.
 */
export const ROUTING_SUPPORTS_EXCLUDE = process.env.EXPO_PUBLIC_ROUTING_EXCLUDE === '1';
