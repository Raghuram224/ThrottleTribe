// Pure helpers for the 6-digit ride code (docs/design/03-join.md).

export const CODE_LENGTH = 6;

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** A deep-link / pasted value as a valid code: exactly 6 digits after stripping the rest, else null. */
export function parseCode(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const digits = digitsOnly(raw);
  return digits.length === CODE_LENGTH ? digits : null;
}

/**
 * New code value after the hidden input changed. Non-digits are stripped ("Code: 123-456" pastes
 * as 123456). With `restartOnType` (an error is showing) a single typed digit starts over;
 * an overflowing paste keeps its last 6 digits.
 */
export function nextCodeValue(raw: string, previous: string, restartOnType = false): string {
  const digits = digitsOnly(raw);
  if (restartOnType && digits.length > previous.length) {
    return digits.length - previous.length === 1 ? digits.slice(-1) : digits.slice(-CODE_LENGTH);
  }
  return digits.slice(0, CODE_LENGTH);
}
