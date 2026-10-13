// Pure auth helpers (no supabase client import, so they are unit-tested and usable from the
// headless location task). "Signed in" = a session is STORED on the device, not "a refresh worked":
// riders open the app in no-signal areas, where the token refresh fails but they are still them.
import { readItem } from '@/lib/storage';

/** Same value supabase-js derives by default (`sb-<project-ref>-auth-token`); passed explicitly to the client. */
export function authStorageKey(supabaseUrl: string | undefined): string {
  try {
    const host = new URL(supabaseUrl ?? '').hostname;
    return `sb-${host.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-unknown-auth-token';
  }
}

/** True when supabase-js has a session (with a refresh token) persisted in local storage. */
export function hasStoredSession(read: (key: string) => string | null = readItem): boolean {
  const raw = read(authStorageKey(process.env.EXPO_PUBLIC_SUPABASE_URL));
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { refresh_token?: unknown } | null;
    return typeof parsed?.refresh_token === 'string' && parsed.refresh_token.length > 0;
  } catch {
    return false;
  }
}

/**
 * Only a definitive server refusal (invalid / revoked refresh token: an AuthApiError with a 400 or
 * 401) means the rider is signed out. Network failures (AuthRetryableFetchError, status 0, 5xx,
 * timeouts) never do.
 */
export function isDefinitiveAuthError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; status?: unknown };
  if (e.name === 'AuthRetryableFetchError') return false;
  if (e.name !== 'AuthApiError') return false;
  return e.status === 400 || e.status === 401;
}
