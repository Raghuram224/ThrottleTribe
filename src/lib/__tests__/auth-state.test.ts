import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { authStorageKey, hasStoredSession, isDefinitiveAuthError } from '../auth-state';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

describe('isDefinitiveAuthError', () => {
  it('network / retryable failures never sign the rider out', () => {
    expect(isDefinitiveAuthError(new AuthRetryableFetchError('fetch failed', 0))).toBe(false);
    expect(isDefinitiveAuthError(new AuthRetryableFetchError('unavailable', 503))).toBe(false);
    expect(isDefinitiveAuthError(new AuthApiError('boom', 500, undefined))).toBe(false);
    expect(isDefinitiveAuthError(new AuthApiError('offline', 0, undefined))).toBe(false);
    expect(isDefinitiveAuthError(new Error('Network request failed'))).toBe(false);
    expect(isDefinitiveAuthError(null)).toBe(false);
    expect(isDefinitiveAuthError(undefined)).toBe(false);
  });
  it('a refused refresh token is definitive', () => {
    expect(isDefinitiveAuthError(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'))).toBe(true);
    expect(isDefinitiveAuthError(new AuthApiError('invalid refresh token', 401, undefined))).toBe(true);
  });
});

describe('hasStoredSession', () => {
  const OLD = process.env.EXPO_PUBLIC_SUPABASE_URL;
  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdref.supabase.co';
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = OLD;
  });

  it('derives supabase-js default key', () => {
    expect(authStorageKey('https://abcdref.supabase.co')).toBe('sb-abcdref-auth-token');
  });
  it('is true only for a stored session with a refresh token', () => {
    const key = 'sb-abcdref-auth-token';
    expect(hasStoredSession(() => null)).toBe(false);
    expect(hasStoredSession((k) => (k === key ? '{"refresh_token":"r","access_token":"a"}' : null))).toBe(true);
    expect(hasStoredSession((k) => (k === key ? '{"access_token":"a"}' : null))).toBe(false);
    expect(hasStoredSession((k) => (k === key ? 'not json' : null))).toBe(false);
  });
});
