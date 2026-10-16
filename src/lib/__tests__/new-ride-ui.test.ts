// L1 (22 D6): the full-map preference does not carry from one ride into the next; the toggle still works within a ride.
import { useLiveUiStore } from '../../store/live-ui-store';
import { createRide, endRide } from '../ride-api';
import { STORAGE_KEYS } from '../storage';
import { markNavRide, navRideDest } from '../nav-rides';

const mockRpc = jest.fn();

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  },
}));
jest.mock('../telemetry', () => ({ track: jest.fn() }));
jest.mock('../auth-state', () => ({ hasStoredSession: () => true }));

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  mockRpc.mockReset();
  useLiveUiStore.setState({ fullMap: false });
});

describe('a new ride never opens in full map', () => {
  it('the toggle works within a ride', () => {
    useLiveUiStore.getState().setFullMap(true);
    expect(useLiveUiStore.getState().fullMap).toBe(true);
    useLiveUiStore.getState().setFullMap(false);
    expect(useLiveUiStore.getState().fullMap).toBe(false);
  });

  it('startNewRide clears full map and the stored preference', () => {
    useLiveUiStore.getState().setFullMap(true);
    useLiveUiStore.getState().startNewRide();
    expect(useLiveUiStore.getState().fullMap).toBe(false);
    expect(mem.get(STORAGE_KEYS.fullMap)).toBe('0');
  });

  it('createRide (Start ride, Invite riders, Just ride) resets it once the ride exists', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'r1' }, error: null });
    useLiveUiStore.getState().setFullMap(true);
    await createRide('Sunday run', 300, { startKind: 'invite' });
    expect(useLiveUiStore.getState().fullMap).toBe(false);
  });

  it('a failed create leaves the preference alone', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    useLiveUiStore.getState().setFullMap(true);
    await createRide('x', 300).catch(() => {});
    expect(useLiveUiStore.getState().fullMap).toBe(true);
  });
});

describe('L7: ending (or cancelling a lobby) from this phone drops the ride marker', () => {
  it('endRide unmarks the ride', async () => {
    markNavRide('r1', '1,2');
    mockRpc.mockResolvedValue({ data: { id: 'r1', status: 'ended' }, error: null });
    await endRide('r1');
    expect(navRideDest('r1')).toBeNull();
  });

  it('a failed end keeps it', async () => {
    markNavRide('r1', '1,2');
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await endRide('r1').catch(() => {});
    expect(navRideDest('r1')).toBe('1,2');
  });
});
