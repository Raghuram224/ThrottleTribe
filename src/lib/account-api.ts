// Supabase calls for saving a guest account and signing in (docs/design/12-account.md).
// Kept out of ride-api.ts: these are auth flows, not ride RPCs. Pure rules live in account.ts.
import { mapAuthError, type AuthErrorKind, type AuthMode, type AuthVia } from '@/lib/account';
import { supabase } from '@/lib/supabase';

export class AuthFlowError extends Error {
  readonly kind: AuthErrorKind;
  readonly waitMin?: number;
  readonly waitS?: number;

  constructor(kind: AuthErrorKind, waitMin?: number, waitS?: number, cause?: unknown) {
    super(`auth_${kind}`);
    this.name = 'AuthFlowError';
    this.kind = kind;
    this.waitMin = waitMin;
    this.waitS = waitS;
    if (cause !== undefined) this.cause = cause;
  }
}

function fail(error: unknown, mode: AuthMode): never {
  const mapped = mapAuthError(error, mode);
  throw new AuthFlowError(mapped.kind, mapped.waitMin, mapped.waitS, error);
}

/**
 * Sends the 6-digit code.
 * - save: `updateUser` on the signed-in guest. The user id stays the same, so rides, profile and
 *   contacts carry over once the code is verified.
 * - signin: `signInWithOtp` with `shouldCreateUser: false`, so a typo never creates an empty account.
 */
export async function requestAuthCode(mode: AuthMode, via: AuthVia, to: string): Promise<void> {
  try {
    if (mode === 'save') {
      const { error } = await supabase.auth.updateUser(via === 'email' ? { email: to } : { phone: to });
      if (error) fail(error, mode);
    } else {
      const { error } = await supabase.auth.signInWithOtp(
        via === 'email'
          ? { email: to, options: { shouldCreateUser: false } }
          : { phone: to, options: { shouldCreateUser: false } },
      );
      if (error) fail(error, mode);
    }
  } catch (e) {
    if (e instanceof AuthFlowError) throw e;
    fail(e, mode);
  }
}

/** Verifies the code. Types per @supabase/auth-js: email_change / phone_change, email / sms. */
export async function verifyAuthCode(
  mode: AuthMode,
  via: AuthVia,
  to: string,
  token: string,
): Promise<void> {
  try {
    const params =
      via === 'email'
        ? { email: to, token, type: mode === 'save' ? ('email_change' as const) : ('email' as const) }
        : { phone: to, token, type: mode === 'save' ? ('phone_change' as const) : ('sms' as const) };
    const { error } = await supabase.auth.verifyOtp(params);
    if (error) fail(error, mode);
  } catch (e) {
    if (e instanceof AuthFlowError) throw e;
    fail(e, mode);
  }
}

/**
 * Does the current guest have anything worth losing on this phone: a ride membership or an
 * emergency contact? No session means a fresh install (nothing to lose). On any error we say yes,
 * so the confirm sheet appears rather than silently dropping data.
 */
export async function guestHasHistory(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const [rides, contacts] = await Promise.all([
      supabase.from('ride_members').select('ride_id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase
        .from('emergency_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);
    if (rides.error || contacts.error) return true;
    return (rides.count ?? 0) > 0 || (contacts.count ?? 0) > 0;
  } catch {
    return true;
  }
}
