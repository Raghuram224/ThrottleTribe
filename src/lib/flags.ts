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
