import { copy } from '../copy';
import {
  accountState,
  afterRateLimit,
  afterResend,
  authErrorMessage,
  firstSend,
  formatCountdown,
  identifyTarget,
  isValidEmail,
  isValidOtp,
  mapAuthError,
  MAX_RESENDS,
  normaliseEmail,
  RESEND_COOLDOWN_S,
  RESEND_LOCK_MS,
  resendInfo,
} from '../account';

describe('email and OTP validation', () => {
  it('trims and lowercases the email, then does a simple shape check', () => {
    expect(normaliseEmail('  Arun@Mail.COM ')).toBe('arun@mail.com');
    expect(isValidEmail('arun@mail.com')).toBe(true);
    expect(isValidEmail(' Arun@Mail.com ')).toBe(true);
    expect(isValidEmail('arun@mail')).toBe(false);
    expect(isValidEmail('arun mail@x.com')).toBe(false);
    expect(isValidEmail('@x.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('an OTP is exactly six digits', () => {
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('12345')).toBe(false);
    expect(isValidOtp('1234567')).toBe(false);
    expect(isValidOtp('12345a')).toBe(false);
    expect(isValidOtp('')).toBe(false);
  });

  it('identifyTarget returns the value the auth API wants, or null', () => {
    expect(identifyTarget('email', ' A@B.co ', '+91')).toBe('a@b.co');
    expect(identifyTarget('email', 'nope', '+91')).toBeNull();
    expect(identifyTarget('phone', '98450 12210', '+91')).toBe('+919845012210');
    expect(identifyTarget('phone', '12', '+91')).toBeNull();
  });
});

describe('accountState', () => {
  it('a guest is anonymous or has no verified email/phone', () => {
    expect(accountState(null).saved).toBe(false);
    expect(accountState({ is_anonymous: true, email: '' }).saved).toBe(false);
    expect(accountState({ is_anonymous: true, email: 'a@b.co' }).saved).toBe(false);
  });
  it('saved = not anonymous with an email or a phone (phone gets its +)', () => {
    expect(accountState({ is_anonymous: false, email: 'a@b.co' })).toEqual({
      saved: true,
      email: 'a@b.co',
      phone: null,
    });
    expect(accountState({ is_anonymous: false, phone: '919845012210' })).toEqual({
      saved: true,
      email: null,
      phone: '+919845012210',
    });
  });
});

describe('resend timer', () => {
  const t0 = 1_000_000;

  it('is locked for 60 s after the first send, then available', () => {
    const s = firstSend(t0);
    expect(resendInfo(s, t0)).toEqual({ canResend: false, secondsLeft: RESEND_COOLDOWN_S, tooMany: false });
    expect(resendInfo(s, t0 + 18_000).secondsLeft).toBe(42);
    expect(resendInfo(s, t0 + 59_100).secondsLeft).toBe(1);
    expect(resendInfo(s, t0 + 60_000)).toEqual({ canResend: true, secondsLeft: 0, tooMany: false });
  });

  it('every resend restarts the 60 s countdown', () => {
    const s = afterResend(firstSend(t0), t0 + 70_000);
    expect(s.resends).toBe(1);
    expect(resendInfo(s, t0 + 70_000).secondsLeft).toBe(60);
  });

  it('after 5 resends it stays disabled for 10 minutes and reports tooMany', () => {
    let s = firstSend(t0);
    let at = t0;
    for (let i = 0; i < MAX_RESENDS; i++) {
      at += 61_000;
      s = afterResend(s, at);
    }
    const info = resendInfo(s, at + 61_000);
    expect(info.tooMany).toBe(true);
    expect(info.canResend).toBe(false);
    expect(info.secondsLeft).toBeGreaterThan(500);
    const free = resendInfo(s, at + RESEND_LOCK_MS + 1);
    expect(free.canResend).toBe(true);
    expect(free.tooMany).toBe(false);
  });

  it('a 429 with a wait pushes availability out and shows it in the countdown', () => {
    const s = afterRateLimit(firstSend(t0), t0 + 61_000, 180);
    expect(resendInfo(s, t0 + 61_000)).toEqual({ canResend: false, secondsLeft: 180, tooMany: false });
  });

  it('formats the countdown as m:ss', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('mapAuthError', () => {
  it('rate limits: 429, error_code, or message; reads the wait in seconds', () => {
    expect(mapAuthError({ status: 429, message: 'x' }, 'signin').kind).toBe('rateLimited');
    expect(mapAuthError({ code: 'over_email_send_rate_limit', message: 'x' }, 'save').kind).toBe('rateLimited');
    expect(
      mapAuthError(
        { message: 'For security purposes, you can only request this after 47 seconds.' },
        'signin',
      ),
    ).toEqual({ kind: 'rateLimited', waitS: 47, waitMin: 1 });
    expect(mapAuthError({ status: 429, message: 'wait 130 seconds' }, 'signin').waitMin).toBe(3);
    expect(mapAuthError({ status: 429, message: 'slow down' }, 'signin').waitMin).toBe(1);
  });

  it('wrong and expired codes: supabase uses one message, so it reads as wrong', () => {
    expect(mapAuthError({ code: 'otp_expired', message: 'Token has expired or is invalid' }, 'signin').kind).toBe(
      'wrong',
    );
    expect(mapAuthError({ message: 'Email link is invalid or has expired' }, 'signin').kind).toBe('wrong');
    expect(mapAuthError({ message: 'The code has expired' }, 'signin').kind).toBe('expired');
  });

  it('sign in with no account', () => {
    expect(mapAuthError({ code: 'otp_disabled', message: 'Signups not allowed for otp' }, 'signin').kind).toBe(
      'noAccount',
    );
    expect(mapAuthError({ message: 'Signups not allowed for otp' }, 'signin').kind).toBe('noAccount');
  });

  it('save with an email or phone another account uses', () => {
    expect(mapAuthError({ code: 'email_exists', message: 'x' }, 'save').kind).toBe('taken');
    expect(mapAuthError({ code: 'phone_exists', message: 'x' }, 'save').kind).toBe('taken');
    expect(
      mapAuthError({ message: 'A user with this email address has already been registered' }, 'save').kind,
    ).toBe('taken');
    // The same message while signing in is not "taken".
    expect(mapAuthError({ code: 'email_exists', message: 'x' }, 'signin').kind).not.toBe('taken');
  });

  it('network and unknown', () => {
    expect(mapAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, 'signin').kind).toBe(
      'network',
    );
    expect(mapAuthError(new Error('Network request failed'), 'signin').kind).toBe('network');
    expect(mapAuthError({ status: 500, message: 'boom' }, 'signin').kind).toBe('unknown');
    expect(mapAuthError(undefined, 'signin').kind).toBe('unknown');
  });
});

describe('authErrorMessage', () => {
  it('uses the copy table with the right words', () => {
    expect(authErrorMessage('wrong', 'email')).toBe(copy['otp.wrong']);
    expect(authErrorMessage('expired', 'email')).toBe(copy['otp.expired']);
    expect(authErrorMessage('rateLimited', 'email', 3)).toBe('Too many tries. Wait 3 min.');
    expect(authErrorMessage('noAccount', 'email')).toBe(
      'No account with that email. Check it, or start as a new rider.',
    );
    expect(authErrorMessage('noAccount', 'phone')).toContain('that number');
    expect(authErrorMessage('taken', 'email')).toBe('That email is already used by another account.');
    expect(authErrorMessage('network', 'email')).toBe(copy['errors.network']);
    expect(authErrorMessage('unknown', 'phone', 1, 'send')).toBe(
      "We couldn't send the code. Check the number and try again.",
    );
    expect(authErrorMessage('unknown', 'phone')).toBe(copy['errors.unknown']);
  });

  it('copy stays within the designer budgets', () => {
    const max: Record<string, number> = {
      'otp.wrong': 48,
      'otp.expired': 36,
      'otp.tooMany': 44,
      'account.codeHint': 28,
      'account.inRide': 36,
      'account.saveSub': 56,
      'account.guestBody': 88,
      'account.signOutBody': 76,
      'welcome.signIn': 20,
    };
    for (const [key, limit] of Object.entries(max)) {
      expect({ key, ok: copy[key as keyof typeof copy].length <= limit }).toEqual({ key, ok: true });
    }
  });
});
