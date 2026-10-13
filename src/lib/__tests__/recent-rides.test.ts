import { copy } from '../copy';
import {
  formatRideDate,
  mapRecentRides,
  parseRideStats,
  recentMeta,
  recentRowLabel,
  type RecentRide,
  type RecentRideRow,
} from '../recent-rides';

const row = (over: Partial<RecentRideRow> = {}): RecentRideRow => ({
  id: 'r1',
  name: 'Sunday Run',
  started_at: '2026-10-10T04:00:00Z',
  ended_at: '2026-10-10T06:14:00Z',
  rider_count: [{ count: 6 }],
  ...over,
});

describe('mapRecentRides', () => {
  it('maps duration and rider count', () => {
    const [ride] = mapRecentRides([row()]);
    expect(ride).toEqual({
      id: 'r1',
      name: 'Sunday Run',
      startedAt: '2026-10-10T04:00:00Z',
      endedAt: '2026-10-10T06:14:00Z',
      durationMs: 134 * 60_000,
      riders: 6,
    });
  });

  it('drops rides that never started or never ended (cancelled lobbies)', () => {
    expect(mapRecentRides([row({ started_at: null }), row({ id: 'r2', ended_at: null })])).toEqual([]);
  });

  it('sorts newest first by end time', () => {
    const out = mapRecentRides([
      row({ id: 'old', ended_at: '2026-10-04T06:00:00Z', started_at: '2026-10-04T04:00:00Z' }),
      row({ id: 'new' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('keeps unknown values as null instead of inventing them', () => {
    const [a] = mapRecentRides([row({ rider_count: null })]);
    expect(a.riders).toBeNull();
    const [b] = mapRecentRides([row({ started_at: '2026-10-10T07:00:00Z' })]); // ends before it starts
    expect(b.durationMs).toBeNull();
  });
});

describe('formatRideDate', () => {
  it('reads "Sat 10 Oct" in local time', () => {
    const local = new Date(2026, 9, 10, 12, 0).toISOString();
    expect(formatRideDate(local)).toBe('Sat 10 Oct');
    expect(formatRideDate('garbage')).toBe('');
  });
});

describe('recentMeta', () => {
  const ride: RecentRide = {
    id: 'r1',
    name: 'Sunday Run',
    startedAt: 'a',
    endedAt: new Date(2026, 9, 10, 12, 0).toISOString(),
    durationMs: 134 * 60_000,
    riders: 6,
  };

  it('joins km (only when cached), duration and riders', () => {
    expect(recentMeta(ride, 86_400)).toBe('86 km · 2 h 14 min · 6 riders');
    expect(recentMeta(ride, null)).toBe('2 h 14 min · 6 riders');
    expect(recentMeta({ ...ride, riders: 1 }, null)).toBe('2 h 14 min · 1 rider');
  });

  it('skips parts it does not know, and a trivial cached distance', () => {
    expect(recentMeta({ ...ride, durationMs: null, riders: null }, 50)).toBe('');
    expect(recentMeta({ ...ride, riders: null }, null)).toBe('2 h 14 min');
  });

  it('builds the spoken row label from the copy template', () => {
    const label = recentRowLabel(ride, '2 h 14 min · 6 riders');
    expect(label).toBe('Sunday Run, Sat 10 Oct, 2 h 14 min · 6 riders. Open summary');
    expect(copy['home.a11yRecentRow'].length).toBeLessThanOrEqual(96);
  });
});

describe('parseRideStats', () => {
  it('reads {rideId: meters} and ignores junk', () => {
    expect(parseRideStats('{"a":86400,"b":"x","c":-5}')).toEqual({ a: 86400 });
    expect(parseRideStats(null)).toEqual({});
    expect(parseRideStats('nope')).toEqual({});
    expect(parseRideStats('[1,2]')).toEqual({});
  });
});
