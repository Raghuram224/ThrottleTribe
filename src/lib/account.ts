// Pure account logic (docs/design/12-account.md): input validation, OTP rules, the resend timer and
// the mapping from Supabase auth errors to our copy keys. No React, no native modules.
import { copy, fill } from '@/lib/copy';
import { normalisePhone } from '@/lib/phone';

export type AuthMode = 'save' | 'signin';
export type AuthVia = 'email' | 'phone';

// ---------------------------------------------------------------- input

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(normaliseEmail(input));
}

export const OTP_LENGTH = 6;

export function isValidOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/** The destination as the auth API wants it, or null when the input is not valid. */
export function identifyTarget(via: AuthVia, input: string, prefix: string): string | null {
  if (via === 'email') return isValidEmail(input) ? normaliseEmail(input) : null;
  return normalisePhone(input, prefix);
}

// ---------------------------------------------------------------- account state

export interface AccountUser {
  is_anonymous?: boolean;
  email?: string | null;
  phone?: string | null;
}

export interface AccountState {
  saved: boolean;
  email: string | null;
  phone: string | null;
}

/** Saved = a verified email or phone is attached. A pending (unverified) change keeps it a guest. */
export function accountState(user: AccountUser | null | undefined): AccountState {
  const email = user?.email || null;
  const phone = user?.phone ? (user.phone.startsWith('+') ? user.phone : `+${user.phone}`) : null;
  return { saved: !!user && !user.is_anonymous && !!(email || phone), email, phone };
}

// ---------------------------------------------------------------- resend timer

export const RESEND_COOLDOWN_S = 60;
export const MAX_RESENDS = 5;
export const RESEND_LOCK_MS = 10 * 60 * 1000;
export const SPAM_HINT_AFTER_S = 20;

export interface ResendState {
  /** Epoch ms of the last code request. */
  sentAt: number;
  /** Resends since the first code. */
  resends: number;
  /** After too many resends, or a 429 with a known wait: no resend before this time. */
  blockedUntil: number | null;
}

export interface ResendInfo {
  canResend: boolean;
  secondsLeft: number;
  /** True while blocked after MAX_RESENDS (shows otp.tooMany). */
  tooMany: boolean;
}

export function firstSend(now: number): ResendState {
  return { sentAt: now, resends: 0, blockedUntil: null };
}

/** State after a successful resend. The 5th resend starts the 10 minute lock. */
export function afterResend(state: ResendState, now: number): ResendState {
  const resends = state.resends + 1;
  return {
    sentAt: now,
    resends,
    blockedUntil: resends >= MAX_RESENDS ? now + RESEND_LOCK_MS : null,
  };
}

/** A 429 tells us how long to wait; the countdown shows it. */
export function afterRateLimit(state: ResendState, now: number, waitS: number): ResendState {
  return { ...state, blockedUntil: now + Math.max(1, waitS) * 1000 };
}

export function resendInfo(state: ResendState, now: number): ResendInfo {
  const cooldownEnd = state.sentAt + RESEND_COOLDOWN_S * 1000;
  const end = Math.max(cooldownEnd, state.blockedUntil ?? 0);
  const secondsLeft = Math.max(0, Math.ceil((end - now) / 1000));
  const tooMany = state.resends >= MAX_RESENDS && (state.blockedUntil ?? 0) > now;
  return { canResend: secondsLeft === 0, secondsLeft, tooMany };
}

/** `42` -> `0:42`, `125` -> `2:05`. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- auth errors

export type AuthErrorKind =
  | 'wrong'
  | 'expired'
  | 'rateLimited'
  | 'noAccount'
  | 'taken'
  | 'network'
  | 'unknown';

export interface MappedAuthError {
  kind: AuthErrorKind;
  /** Minutes to wait, for rateLimited (at least 1). */
  waitMin?: number;
  /** Seconds to wait, for rateLimited when the server said so. */
  waitS?: number;
}

interface AuthErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

/** The inline error line for a kind (12 §3 error table). `stage` picks the wording for a failed send. */
export function authErrorMessage(
  kind: AuthErrorKind,
  via: AuthVia,
  waitMin = 1,
  stage: 'send' | 'verify' = 'verify',
): string {
  const word = via === 'email' ? copy['account.viaWordEmail'] : copy['account.viaWordPhone'];
  switch (kind) {
    case 'wrong':
      return copy['otp.wrong'];
    case 'expired':
      return copy['otp.expired'];
    case 'rateLimited':
      return fill(copy['otp.rateLimited'], { n: waitMin });
    case 'noAccount':
      return fill(copy['account.noAccount'], { via: word });
    case 'taken':
      return fill(copy['account.taken'], { via: word });
    case 'network':
      return copy['errors.network'];
    default:
      return stage === 'send'
        ? fill(copy['account.sendFailed'], { via: word })
        : copy['errors.unknown'];
  }
}

/**
 * Maps a supabase-js AuthError to a kind. Supabase answers a wrong code and an expired code with
 * the same "Token has expired or is invalid" (error_code otp_expired), so that case reads as
 * `wrong` ("check it and try again") unless the message only says expired.
 */
export function mapAuthError(error: unknown, mode: AuthMode): MappedAuthError {
  const e: AuthErrorLike = typeof error === 'object' && error !== null ? (error as AuthErrorLike) : {};
  const message = String(e.message ?? error ?? '');
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : 0;

  if (status === 429 || /rate_limit/.test(code) || /rate limit|too many|only request this after/i.test(message)) {
    const seconds = Number(/(\d+)\s*seconds?/i.exec(message)?.[1]);
    const waitS = Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
    return { kind: 'rateLimited', waitS, waitMin: Math.max(1, Math.ceil((waitS ?? 60) / 60)) };
  }
  if (
    mode === 'save' &&
    (code === 'email_exists' ||
      code === 'phone_exists' ||
      code === 'identity_already_exists' ||
      /already (been )?registered|already exists|already in use|already used|already linked/i.test(message))
  ) {
    return { kind: 'taken' };
  }
  if (
    mode === 'signin' &&
    (code === 'otp_disabled' ||
      code === 'user_not_found' ||
      /signups? not allowed|user not found|not found/i.test(message))
  ) {
    return { kind: 'noAccount' };
  }
  if (code === 'otp_expired' || /invalid|incorrect|wrong/i.test(message)) return { kind: 'wrong' };
  if (/expired/i.test(message)) return { kind: 'expired' };
  if (
    e.name === 'AuthRetryableFetchError' ||
    (status === 0 && /network|fetch|timed? ?out|offline|failed to/i.test(message))
  ) {
    return { kind: 'network' };
  }
  return { kind: 'unknown' };
}
