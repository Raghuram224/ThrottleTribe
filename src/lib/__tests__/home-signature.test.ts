import { homeConvoy, type HomeSnapshot } from '../home-convoy';
import { monthStats, saddleParts, type RecentRide } from '../recent-rides';

const NOW = Date.parse('2026-10-12T08:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const snap = (over: Partial<HomeSnapshot> = {}): HomeSnapshot => ({
  ride: { stop_threshold_s: 180, started_at: iso(3_600_000) },
  members: [
    { user_id: 'me', display_name: 'Raghu', role: 'leader', color_index: 0, sos: false, sos_at: null, left_at: null },
    { user_id: 'pr', display_name: 'Priya', role: 'rider', color_index: 2, sos: false, sos_at: null, left_at: null },
    { user_id: 'ka', display_name: 'Karthik', role: 'rider', color_index: 3, sos: false, sos_at: null, left_at: null },
  ],
  positions: [
    { user_id: 'me', lat: 12.02, lng: 77, updated_at: iso(2000), slow_since: null },
    { user_id: 'pr', lat: 12.01, lng: 77, updated_at: iso(2000), slow_since: null },
    { user_id: 'ka', lat: 12.03, lng: 77, updated_at: iso(2000), slow_since: null },
  ],
  leaderTrail: Array.from({ length: 41 }, (_, i) => ({
    lat: 12 + i * 0.001,
    lng: 77,
    recorded_at: iso(3_600_000 - i * 60_000),
  })),
  ...over,
});

describe('homeConvoy', () => {
  it('builds the convoy and says everyone is moving', () => {
    const h = homeConvoy(snap(), 'me', NOW);
    expect(h.model?.riders.map((r) => r.key).sort()).toEqual(['ka', 'me', 'pr']);
    expect(h.exception).toEqual({ text: 'Everyone is moving', status: 'moving' });
  });

  it('names the most severe exception with its age', () => {
    const s = snap();
    s.positions[1] = { ...s.positions[1], updated_at: iso(61_000 + 60_000) }; // Priya: no signal 2 min
    const h = homeConvoy(s, 'me', NOW);
    expect(h.exception.status).toBe('offline');
    expect(h.exception.text).toBe('Priya · no signal 2 min');
  });

  it('SOS beats offline', () => {
    const s = snap();
    s.positions[1] = { ...s.positions[1], updated_at: iso(600_000) };
    s.members[2] = { ...s.members[2], sos: true, sos_at: iso(1000) };
    expect(homeConvoy(s, 'me', NOW).exception).toEqual({ text: 'Karthik · SOS', status: 'sos' });
  });

  it('has no convoy while I have no position', () => {
    const s = snap();
    s.positions = s.positions.filter((p) => p.user_id !== 'me');
    expect(homeConvoy(s, 'me', NOW).model).toBeNull();
  });
});

describe('monthStats', () => {
  const ride = (id: string, endedAt: string, durationMs: number | null): RecentRide => ({
    id,
    name: id,
    startedAt: endedAt,
    endedAt,
    durationMs,
    riders: 3,
  });
  const rides = [
    ride('a', '2026-10-10T10:00:00', 2 * 3_600_000 + 14 * 60_000),
    ride('b', '2026-10-04T10:00:00', 3_600_000 + 20 * 60_000),
    ride('old', '2026-09-28T10:00:00', 3_600_000),
  ];
  const now = new Date('2026-10-12T12:00:00').getTime();

  it('sums this calendar month only, from cached distances', () => {
    const s = monthStats(rides, { a: 61_000, b: 38_000, old: 99_000 }, now);
    expect(s?.km.map((p) => p.text).join('')).toBe('99 km');
    expect(s?.rides[0].text).toBe('2');
    expect(s?.saddle.map((p) => p.text).join('')).toBe('3 h 34');
    expect(s?.a11y).toBe('99 km this month, 2 rides, 3 h 34 in the saddle');
  });

  it('is null without a cached ride this month', () => {
    expect(monthStats(rides, { old: 5000 }, now)).toBeNull();
    expect(monthStats(rides, {}, now)).toBeNull();
    expect(monthStats([], {}, now)).toBeNull();
  });

  it('formats saddle time with units', () => {
    expect(saddleParts(40 * 60_000).map((p) => p.text).join('')).toBe('40 min');
    expect(saddleParts(7 * 3_600_000 + 5 * 60_000).map((p) => p.text).join('')).toBe('7 h 05');
  });
});
