import { ensureSession } from '../location/sample-queue';

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('expo-location', () => ({}));
jest.mock('../telemetry', () => ({ track: jest.fn() }));
jest.mock('../location/ride-config', () => ({
  clearRideId: jest.fn(),
  getRideId: jest.fn(),
  LOCATION_TASK_NAME: 'task',
  setTrackingFlag: jest.fn(),
}));

const mockGetSession = jest.fn();
const mockSignIn = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: () => mockGetSession(), signInAnonymously: () => mockSignIn() } },
}));

const STORAGE_KEY = 'sb-abcdref-auth-token';
let store: Map<string, string>;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdref.supabase.co';
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  mockGetSession.mockReset();
  mockSignIn.mockReset().mockResolvedValue({ error: null });
});

describe('ensureSession', () => {
  it('uses the live session without signing in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });
    await ensureSession();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('never signs in anonymously when the refresh failed retryably (offline)', async () => {
    store.set(STORAGE_KEY, '{"refresh_token":"r"}');
    const netErr = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: netErr });
    await expect(ensureSession()).rejects.toBe(netErr);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('never signs in anonymously when a session is stored, even without an error', async () => {
    store.set(STORAGE_KEY, '{"refresh_token":"r"}');
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(ensureSession()).rejects.toThrow();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signs in anonymously only when there is no stored session at all', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    await ensureSession();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});
