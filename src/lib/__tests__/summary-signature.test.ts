import { copy } from '../copy';
import {
  averageKmh,
  buildRideLog,
  distanceAtTime,
  filterSamples,
  formatClock,
  formatRideRange,
  sumDistanceM,
  type SummarySample,
} from '../summary';

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 12, h, m, s).toISOString();
const ms = (h: number, m: number) => new Date(2026, 9, 12, h, m).getTime();

// ~11.1 m per 0.0001 deg of latitude; one sample per 10 s => 1.1 m/s.
const ride = (n: number, startMin = 0): SummarySample[] =>
  Array.from({ length: n }, (_, i) => ({
    lat: 12 + i * 0.0001,
    lng: 77,
    recorded_at: at(6, startMin, i * 10),
    accuracy_m: 5,
  }));

describe('averageKmh', () => {
  it('is distance over time, rounded', () => {
    expect(averageKmh(61_000, 2 * 3_600_000 + 14 * 60_000)).toBe(27);
  });
  it('is hidden under 1 km or 5 minutes, or when unknown', () => {
    expect(averageKmh(900, 3_600_000)).toBeNull();
    expect(averageKmh(10_000, 4 * 60_000)).toBeNull();
    expect(averageKmh(null, 3_600_000)).toBeNull();
    expect(averageKmh(10_000, null)).toBeNull();
  });
});

describe('filterSamples', () => {
  it('drops inaccurate samples and teleport spikes', () => {
    const base = ride(6);
    const noisy: SummarySample[] = [
      base[0],
      base[1],
      { ...base[2], accuracy_m: 400 }, // noise
      { lat: 40, lng: 100, recorded_at: base[2].recorded_at, accuracy_m: 5 }, // spike
      base[3],
      base[4],
    ];
    const out = filterSamples(noisy);
    expect(out).toEqual([base[0], base[1], base[3], base[4]]);
  });

  it('keeps the route consistent with the summed distance', () => {
    const s = ride(40);
    expect(filterSamples(s)).toHaveLength(40);
    expect(sumDistanceM(s)).toBeGreaterThan(400);
  });
});

describe('distanceAtTime', () => {
  const s = ride(31); // 5 minutes, ~333 m
  it('sums my distance up to the time', () => {
    const half = distanceAtTime(s, Date.parse(at(6, 0, 150)));
    const full = distanceAtTime(s, Date.parse(at(6, 10)));
    expect(half).toBeGreaterThan(150);
    expect(half).toBeLessThan(200);
    expect(full).toBeCloseTo(sumDistanceM(s), 5);
  });
  it('is null before the first sample or with too few samples', () => {
    expect(distanceAtTime(s, Date.parse(at(5, 0)))).toBeNull();
    expect(distanceAtTime(s.slice(0, 1), Date.parse(at(7, 0)))).toBeNull();
  });
});

describe('formatClock / formatRideRange', () => {
  it('uses a 12-hour clock without the meridiem', () => {
    expect(formatClock(ms(6, 4))).toBe('6:04');
    expect(formatClock(ms(0, 5))).toBe('12:05');
    expect(formatClock(ms(18, 30))).toBe('6:30');
  });
  it('formats the ride range like the mock', () => {
    expect(formatRideRange(at(6, 4), at(8, 18))).toBe('Mon, Oct 12 · 6:04 – 8:18 AM');
  });
  it('shows both meridiems when they differ and tolerates a missing end', () => {
    expect(formatRideRange(at(11, 40), at(13, 10))).toBe('Mon, Oct 12 · 11:40 AM – 1:10 PM');
    expect(formatRideRange(at(6, 4), null)).toBe('Mon, Oct 12 · 6:04 AM');
    expect(formatRideRange(null, null)).toBe('');
  });
});

describe('buildRideLog', () => {
  const nameOf = (id: string) => ({ a: 'Arun', k: 'Karthik' })[id as 'a' | 'k'] ?? 'Rider';
  const samples = ride(361); // 1 hour from 6:00, ~4 km
  const log = buildRideLog({
    startedAt: at(6, 0),
    endedAt: at(7, 10),
    riders: 5,
    stops: [{ userId: 'a', at: ms(6, 30) }],
    sos: [{ userId: 'k', at: ms(6, 45), clearedAt: ms(6, 50) }],
    nameOf,
    samples,
  });

  it('is chronological: started, stop, SOS, ended', () => {
    expect(log.map((e) => e.kind)).toEqual(['start', 'stop', 'sos', 'end']);
    expect(log.map((e) => e.time)).toEqual(['6:00', '6:30', '6:45', '7:10']);
  });

  it('writes the titles and my km at the time', () => {
    expect(log[0].title).toBe('Started · 5 riders');
    expect(log[1].title).toBe('Arun stopped');
    expect(log[1].meta).toBe('km 2');
    expect(log[2].title).toBe('Karthik sent SOS');
    expect(log[2].meta).toBe('Cleared 6:50 · km 3');
    expect(log[3].title).toBe(copy['summary.logEnded']);
    expect(log[3].meta).toBe(copy['summary.logEndedMeta']);
  });

  it('omits km without samples and says "Not cleared" for an open SOS', () => {
    const l = buildRideLog({
      startedAt: at(6, 0),
      endedAt: null,
      riders: 1,
      stops: [{ userId: 'a', at: ms(6, 30) }],
      sos: [{ userId: 'k', at: ms(6, 45), clearedAt: null }],
      nameOf,
      samples: null,
    });
    expect(l.map((e) => e.kind)).toEqual(['start', 'stop', 'sos']);
    expect(l[1].meta).toBeNull();
    expect(l[2].meta).toBe('Not cleared');
    expect(l[0].title).toBe('Started · 1 rider');
  });
});
