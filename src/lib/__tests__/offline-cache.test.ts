import { cacheRecentRides, clearOfflineCache, readCachedRecentRides } from '../offline-cache';
import type { RecentRide } from '../recent-rides';

const mockMem = new Map<string, string>();
jest.mock('../storage', () => ({
  STORAGE_KEYS: {
    cachedProfile: 'p',
    cachedOpenRide: 'o',
    cachedRecentRides: 'r',
  },
  readItem: (k: string) => mockMem.get(k) ?? null,
  writeItem: (k: string, v: string | null) => {
    if (v === null) mockMem.delete(k);
    else mockMem.set(k, v);
  },
}));

const ride: RecentRide = {
  id: 'r1',
  name: 'Sunday',
  startedAt: '2026-10-01T05:00:00Z',
  endedAt: '2026-10-01T07:00:00Z',
  durationMs: 7_200_000,
  riders: 3,
};

describe('recent rides cache', () => {
  beforeEach(() => mockMem.clear());

  it('returns null when nothing was cached, then the last successful list', () => {
    expect(readCachedRecentRides()).toBeNull();
    cacheRecentRides([ride]);
    expect(readCachedRecentRides()).toEqual([ride]);
    cacheRecentRides([]);
    expect(readCachedRecentRides()).toEqual([]);
  });

  it('ignores corrupt data and is cleared with the rest of the offline cache', () => {
    mockMem.set('r', '{"nope":1}');
    expect(readCachedRecentRides()).toBeNull();
    mockMem.set('r', '[1,2]');
    expect(readCachedRecentRides()).toBeNull();
    cacheRecentRides([ride]);
    clearOfflineCache();
    expect(readCachedRecentRides()).toBeNull();
  });
});
