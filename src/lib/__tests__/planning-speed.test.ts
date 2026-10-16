import { deriveSpeed, firstFixRetryMs, fixFresh, FIX_MAX_AGE_MS, nextAnchor, planningWatchWanted, type SpeedFix } from '../planning-speed';

const M_PER_DEG_LAT = 111_320;
const fix = (northM: number, takenAt: number, over: Partial<SpeedFix> = {}): SpeedFix => ({
  lat: 12 + northM / M_PER_DEG_LAT,
  lng: 77,
  accuracyM: 10,
  speedMps: 0,
  takenAt,
  ...over,
});

describe('deriveSpeed', () => {
  it('trusts a reported speed above zero', () => {
    expect(deriveSpeed(null, fix(0, 0, { speedMps: 8 }))).toBe(8);
  });

  it('derives from distance over time when the OS reports 0 or -1 (Android / iOS, Balanced accuracy)', () => {
    for (const reported of [0, -1, null]) {
      const v = deriveSpeed(fix(0, 0), fix(50, 5000, { speedMps: reported }));
      expect(v).toBeCloseTo(10, 1);
    }
  });

  it('has no evidence for the first fix', () => {
    expect(deriveSpeed(null, fix(0, 0))).toBeNull();
  });

  it('reads GPS jitter at a standstill as 0, not as movement', () => {
    // 8 m and 12 m wanderings inside a 10-15 m accuracy circle, a few seconds apart.
    expect(deriveSpeed(fix(0, 0, { accuracyM: 15 }), fix(8, 3000, { accuracyM: 15 }))).toBe(0);
    expect(deriveSpeed(fix(0, 0, { accuracyM: 10 }), fix(10, 2000, { accuracyM: 12 }))).toBe(0);
  });

  it('ignores pairs with poor or unknown accuracy', () => {
    expect(deriveSpeed(fix(0, 0), fix(80, 5000, { accuracyM: 120 }))).toBeNull();
    expect(deriveSpeed(fix(0, 0, { accuracyM: 60 }), fix(80, 5000))).toBeNull();
    expect(deriveSpeed(fix(0, 0), fix(80, 5000, { accuracyM: null }))).toBeNull();
  });

  it('ignores pairs that are too close in time or too far apart', () => {
    expect(deriveSpeed(fix(0, 0), fix(30, 500))).toBeNull();
    expect(deriveSpeed(fix(0, 0), fix(500, 60_000))).toBeNull();
    expect(deriveSpeed(fix(0, 1000), fix(30, 0))).toBeNull();
  });

  it('a 30 km/h ride crosses the 10 km/h lock threshold', () => {
    const v = deriveSpeed(fix(0, 0), fix(25, 3000));
    expect((v ?? 0) * 3.6).toBeGreaterThan(10);
  });
});

describe('nextAnchor', () => {
  it('keeps the older fix while fixes come faster than a second, so the gap can grow', () => {
    const a = fix(0, 0);
    const b = fix(10, 600);
    expect(nextAnchor(a, b)).toBe(a);
    const c = fix(20, 1200);
    expect(nextAnchor(a, c)).toBe(c);
    // 20 m in 1.2 s from the kept anchor (not 10 m in 0.6 s from the neighbour, which would be skipped).
    expect(deriveSpeed(a, c)).toBeCloseTo(16.7, 0);
    expect(deriveSpeed(a, b)).toBeNull();
  });
  it('starts from the first fix', () => {
    const a = fix(0, 0);
    expect(nextAnchor(null, a)).toBe(a);
  });
});

describe('planningWatchWanted (M3)', () => {
  it('watches only while the screen is focused, permitted and the app is in the foreground', () => {
    expect(planningWatchWanted({ focused: true, granted: true, appActive: true })).toBe(true);
    expect(planningWatchWanted({ focused: true, granted: true, appActive: false })).toBe(false);
    expect(planningWatchWanted({ focused: false, granted: true, appActive: true })).toBe(false);
    expect(planningWatchWanted({ focused: true, granted: false, appActive: true })).toBe(false);
  });
});

describe('fixFresh (22 §4.4)', () => {
  it('a fix counts for 2 minutes, then the marker goes', () => {
    expect(FIX_MAX_AGE_MS).toBe(120_000);
    expect(fixFresh(1000, 1000 + 120_000)).toBe(true);
    expect(fixFresh(1000, 1000 + 120_001)).toBe(false);
  });
  it('a fix from the future (clock skew) is fresh, not stale', () => {
    expect(fixFresh(5000, 1000)).toBe(true);
  });
});

describe('firstFixRetryMs', () => {
  it('retries quickly twice, then settles at 10 s', () => {
    expect([0, 1].map(firstFixRetryMs)).toEqual([3000, 3000]);
    expect([2, 3, 50].map(firstFixRetryMs)).toEqual([10_000, 10_000, 10_000]);
  });
});
