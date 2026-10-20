import { buildSos, buildStops, distanceTooShort, durationTooBrief, leftEarly, rideDurationMs, sumDistanceM, summaryMapHeight, summaryTimeParts, TOO_SHORT_M, type SummaryEvent } from '../summary';

const T0 = Date.parse('2026-01-01T10:00:00Z');
const iso = (secFromStart: number) => new Date(T0 + secFromStart * 1000).toISOString();
// 0.001 degrees of latitude is about 111 m.
const sample = (sec: number, latDeg: number, accuracy: number | null = 5) => ({
  lat: latDeg,
  lng: 0,
  recorded_at: iso(sec),
  accuracy_m: accuracy,
});

describe('sumDistanceM', () => {
  it('sums consecutive hops', () => {
    const d = sumDistanceM([sample(0, 0), sample(10, 0.001), sample(20, 0.002)]);
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(224);
  });

  it('ignores inaccurate samples', () => {
    const d = sumDistanceM([sample(0, 0), sample(10, 0.5, 80), sample(20, 0.001)]);
    expect(d).toBeLessThan(115);
  });

  it('ignores a GPS spike (> 200 km/h) without breaking the next hop', () => {
    const d = sumDistanceM([sample(0, 0), sample(5, 0.5), sample(10, 0.001)]);
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });

  it('re-anchors after repeated jumps (a real gap)', () => {
    const d = sumDistanceM([
      sample(0, 0),
      sample(1, 1),
      sample(2, 1.0001),
      sample(3, 1.0002),
      sample(4, 1.0003),
      sample(14, 1.0013),
    ]);
    // Only the hops after the re-anchor count (about 111 m).
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });

  it('is 0 for fewer than two samples or no time passing', () => {
    expect(sumDistanceM([])).toBe(0);
    expect(sumDistanceM([sample(0, 0)])).toBe(0);
    expect(sumDistanceM([sample(0, 0), sample(0, 0.001)])).toBe(0);
  });
});

describe('rideDurationMs', () => {
  it('floors to whole minutes', () => {
    expect(rideDurationMs(iso(0), iso(134 * 60 + 59))).toBe(134 * 60_000);
  });
  it('is null without start or end', () => {
    expect(rideDurationMs(null, iso(10))).toBeNull();
    expect(rideDurationMs(iso(0), null)).toBeNull();
  });
});

const ev = (type: string, userId: string, sec: number, payload: unknown = {}): SummaryEvent => ({
  type,
  user_id: userId,
  created_at: iso(sec),
  payload,
});

describe('buildStops', () => {
  it('uses payload.since, orders oldest first and merges quick repeats by the same rider', () => {
    const stops = buildStops([
      ev('stopped', 'a', 700, { since: iso(500) }),
      ev('stopped', 'a', 760, { since: iso(560) }), // within 2 min of the previous: merged
      ev('stopped', 'b', 300, { since: iso(100) }),
      ev('stopped', 'a', 2000, { since: iso(1800) }),
      ev('message', 'a', 10),
    ]);
    expect(stops.map((s) => [s.userId, (s.at - T0) / 1000])).toEqual([
      ['b', 100],
      ['a', 500],
      ['a', 1800],
    ]);
  });

  it('falls back to the event time', () => {
    expect(buildStops([ev('stopped', 'a', 90)])[0].at).toBe(T0 + 90_000);
  });

  it('ignores stops that began before the ride started (lobby events on old rides)', () => {
    const stops = buildStops(
      [
        ev('stopped', 'a', 400, { since: iso(50) }), // lobby stop, reported later
        ev('stopped', 'b', 500, { since: iso(300) }), // exactly at start: kept
        ev('stopped', 'a', 900, { since: iso(800) }),
      ],
      iso(300),
    );
    expect(stops.map((s) => [s.userId, (s.at - T0) / 1000])).toEqual([
      ['b', 300],
      ['a', 800],
    ]);
    // No start time (cancelled ride) keeps the old behaviour.
    expect(buildStops([ev('stopped', 'a', 90)], null)).toHaveLength(1);
  });
});

describe('leftEarly', () => {
  it('is true only when the rider left before the ride ended', () => {
    expect(leftEarly(iso(100), iso(200))).toBe(true);
    expect(leftEarly(iso(300), iso(200))).toBe(false); // left after the end
    expect(leftEarly(iso(200), iso(200))).toBe(false);
    expect(leftEarly(null, iso(200))).toBe(false);
    expect(leftEarly(iso(100), null)).toBe(true);
  });
});

describe('buildSos', () => {
  it('pairs each sos with the next clear of the same rider', () => {
    const out = buildSos([
      ev('sos', 'a', 100),
      ev('sos', 'b', 150),
      ev('sos_cleared', 'a', 200),
      ev('sos', 'a', 400),
    ]);
    expect(out.map((s) => [s.userId, (s.at - T0) / 1000, s.clearedAt === null ? null : (s.clearedAt - T0) / 1000])).toEqual([
      ['a', 100, 200],
      ['b', 150, null],
      ['a', 400, null],
    ]);
  });
});

describe('too short to measure (26 S1)', () => {
  it('under 50 m is too short; 50 m and unknown are not', () => {
    expect(TOO_SHORT_M).toBe(50);
    expect(distanceTooShort(0)).toBe(true);
    expect(distanceTooShort(49.9)).toBe(true);
    expect(distanceTooShort(50)).toBe(false);
    expect(distanceTooShort(null)).toBe(false);
  });
});

describe('summaryMapHeight (26 S2)', () => {
  it('is 40 % of the window, clamped to 300 to 400 dp', () => {
    expect(summaryMapHeight(914)).toBe(366);
    expect(summaryMapHeight(780)).toBe(312);
    expect(summaryMapHeight(600)).toBe(300);
    expect(summaryMapHeight(1400)).toBe(400);
  });
});

describe('a ride under a minute (26 S1)', () => {
  const normal = (ms: number) => [{ text: String(Math.floor(ms / 60_000)), unit: false }, { text: ' min', unit: true }];
  it('reads "< 1 min", not "0 min"', () => {
    expect(durationTooBrief(59_999)).toBe(true);
    expect(durationTooBrief(60_000)).toBe(false);
    expect(durationTooBrief(null)).toBe(false);
    expect(summaryTimeParts(30_000, normal).map((p) => p.text).join('')).toBe('< 1 min');
  });
  it('a minute or more, and unknown, are unchanged', () => {
    expect(summaryTimeParts(120_000, normal).map((p) => p.text).join('')).toBe('2 min');
    expect(summaryTimeParts(null, normal)).toEqual([{ text: '—', unit: false }]);
  });
});
