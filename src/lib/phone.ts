// Pure phone helpers (docs/design/10-invite.md §7). No React, no native modules.
// Shared by invites and account sign-in; emergency contacts may allow short codes on their own.

export const DEFAULT_PREFIX = '+91';
export const PHONE_PREFIXES = ['+91', '+971', '+65', '+44', '+1'] as const;

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Indian mobile numbers start with 6-9 and have 10 digits. */
const isIndianMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

/** `9845012210`, `09845012210` or `919845012210` -> `919845012210`; anything else null. */
function indianE164Digits(digits: string): string | null {
  if (isIndianMobile(digits)) return `91${digits}`;
  if (digits.length === 11 && digits[0] === '0' && isIndianMobile(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && isIndianMobile(digits.slice(2))) return digits;
  return null;
}

/** Same pattern as the emergency_contacts check constraint. */
const CONTACT_DB_PHONE = /^\+?[0-9]{3,15}$/;

export interface NormaliseOptions {
  /**
   * Emergency-contact mode (11 §3): 3-5 digit short codes (108, 112) are kept as typed, a number that
   * fits no other rule gets `prefix` + digits, and the result only has to satisfy the DB check
   * (3-15 digits) instead of the 8-15 digit rule.
   */
  allowShortCodes?: boolean;
}

/**
 * The one phone normaliser. Normalises typed or picked text to `+<digits>` (8-15 digits), else null.
 * - A leading `+` (or `00`) keeps the typed country code.
 * - Otherwise `prefix` (default +91) applies: for +91 a 10-digit number starting 6-9, or `0` + 10
 *   digits, or `91` + 10 digits; for other prefixes the digits with one leading `0` dropped.
 * - `prefix` '' means "no default": only numbers typed with `+` are accepted.
 */
export function normalisePhone(
  input: string,
  prefix: string = DEFAULT_PREFIX,
  options: NormaliseOptions = {},
): string | null {
  const text = input.trim();
  if (!text) return null;
  const digits = digitsOnly(text);
  if (!digits) return null;

  if (options.allowShortCodes) {
    let out: string;
    if (text.startsWith('+')) out = `+${digits}`;
    else if (digits.length >= 3 && digits.length <= 5) out = digits;
    else {
      const indian = indianE164Digits(digits);
      if (indian) out = `+${indian}`;
      else if (digits.length < 6) return null; // 1-2 digits: neither a short code nor a number
      else out = `${prefix}${digits}`;
    }
    return CONTACT_DB_PHONE.test(out) ? out : null;
  }

  let full: string;
  if (text.startsWith('+')) {
    full = digits;
  } else if (text.startsWith('00') && digits.length > 2) {
    full = digits.slice(2);
  } else if (!prefix) {
    return null;
  } else if (prefix === '+91') {
    const indian = indianE164Digits(digits);
    if (!indian) return null;
    full = indian;
  } else {
    const national = digits.replace(/^0/, '');
    full = `${digitsOnly(prefix)}${national}`;
  }

  if (full.length < MIN_DIGITS || full.length > MAX_DIGITS) return null;
  return `+${full}`;
}

/** `+919845012210` -> `+91 98450 12210`. Other countries: `+<cc> <rest in groups of 4>` best effort. */
export function formatPhoneDisplay(e164: string): string {
  const digits = digitsOnly(e164);
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  const cc = PHONE_PREFIXES.map((p) => p.slice(1))
    .filter((p) => digits.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  if (!cc) return `+${digits}`;
  const rest = digits.slice(cc.length).replace(/(\d{4})(?=\d)/g, '$1 ');
  return `+${cc} ${rest}`;
}

/** Groups digits as typed for the +91 field: `9845012210` -> `98450 12210`. */
export function groupTypedDigits(text: string): string {
  if (text.trim().startsWith('+')) return text;
  const digits = digitsOnly(text).slice(0, 15);
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}
