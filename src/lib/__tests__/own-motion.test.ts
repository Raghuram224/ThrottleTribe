import { bearingDeg } from '@/lib/geo';
import { deriveMotion, effectiveMotion, pushFix, type Fix } from '@/lib/own-motion';
import { INITIAL_BEARING, normalizeDeg, shortestDelta, stepBearing } from '@/lib/nav-camera';

const M_PER_DEG = 111_195;
/** A fix `dN` metres north and `dE` metres east of Bengaluru, `sec` seconds after t0. */
const at = (dN: number, dE: number, sec: number): Fix => ({
  lat: 12.95 + dN / M_PER_DEG,
  lng: 77.55 + dE / (M_PER_DEG * Math.cos((12.95 * Math.PI) / 180)),
  t: 1_000_000 + sec * 1000,
});
const build = (fixes: Fix[]) => fixes.reduce<Fix[]>((h, f) => pushFix(h, f), []);

describe('deriveMotion', () => {
  it('needs two fixes', () => {
    expect(deriveMotion([])).toBeNull();
    expect(deriveMotion([at(0, 0, 0)])).toBeNull();
  });

  it('north, east, south, west courses (clockwise from north)', () => {
    expect(deriveMotion(build([at(0, 0, 0), at(30, 0, 2)]))?.courseDeg).toBeCloseTo(0, 0);
    expect(deriveMotion(build([at(0, 0, 0), at(0, 30, 2)]))?.courseDeg).toBeCloseTo(90, 0);
    expect(deriveMotion(build([at(0, 0, 0), at(-30, 0, 2)]))?.courseDeg).toBeCloseTo(180, 0);
    expect(deriveMotion(build([at(0, 0, 0), at(0, -30, 2)]))?.courseDeg).toBeCloseTo(270, 0);
  });

  it('north-west travel is ~315 and the speed is distance / time', () => {
    const m = deriveMotion(build([at(0, 0, 0), at(30, -30, 2)]));
    expect(m?.courseDeg).toBeCloseTo(315, 0);
    // 42.4 m in 2 s = 21.2 m/s = 76.4 km/h
    expect(m?.speedKmh).toBeCloseTo(76.4, 0);
  });

  it('skips earlier fixes closer than 15 m and uses the most recent far-enough one', () => {
    const h = build([at(0, 0, 0), at(8, 0, 1), at(16, 0, 2), at(24, 0, 3)]);
    const m = deriveMotion(h);
    expect(m?.courseDeg).toBeCloseTo(0, 0);
    // baseline is the fix at 8 m (16 m away, 2 s): 8 m/s
    expect(m?.speedKmh).toBeCloseTo(28.8, 0);
  });

  it('ignores earlier fixes older than 15 s', () => {
    expect(deriveMotion(build([at(0, 0, 0), at(100, 0, 20)]))).toBeNull();
  });

  it('reports stopped (no course) when nothing moves for a while', () => {
    const m = deriveMotion(build([at(0, 0, 0), at(2, 0, 3), at(3, 0, 6)]));
    expect(m?.courseDeg).toBeNull();
    expect(m?.speedKmh).toBeLessThan(2);
  });

  it('a GPS jump restarts the history instead of producing a course', () => {
    const h = build([at(0, 0, 0), at(30, 0, 2), at(50_000, 0, 4)]);
    expect(h).toHaveLength(1);
    expect(deriveMotion(h)).toBeNull();
  });

  it('ignores duplicate and out-of-order timestamps', () => {
    const h = build([at(0, 0, 0), at(30, 0, 2), at(60, 0, 2), at(10, 0, 1)]);
    expect(h).toHaveLength(2);
  });
});

describe('effectiveMotion', () => {
  it('prefers derived course over a placeholder GPS heading of 0', () => {
    const e = effectiveMotion({ heading: 0, speedMps: 17 }, { courseDeg: 315, speedKmh: 60 });
    expect(e.courseDeg).toBe(315);
    expect(e.speedKmh).toBeCloseTo(61.2, 1);
  });

  it('falls back to GPS heading, and to derived speed when GPS speed is null or 0', () => {
    expect(effectiveMotion({ heading: 120, speedMps: 10 }, null)).toEqual({ courseDeg: 120, speedKmh: 36 });
    expect(effectiveMotion({ heading: null, speedMps: null }, { courseDeg: 10, speedKmh: 50 })).toEqual({
      courseDeg: 10,
      speedKmh: 50,
    });
    expect(effectiveMotion({ heading: null, speedMps: 0 }, { courseDeg: 10, speedKmh: 50 }).speedKmh).toBe(50);
  });

  it('unknown everything stays unknown; invalid GPS course (-1) is dropped', () => {
    expect(effectiveMotion({ heading: null, speedMps: null }, null)).toEqual({ courseDeg: null, speedKmh: null });
    expect(effectiveMotion({ heading: -1, speedMps: 0 }, null).courseDeg).toBeNull();
  });
});

describe('heading-up convention', () => {
  it('riding NW with a derived course: the camera converges on ~315 and the arrow points up', () => {
    const course = deriveMotion(build([at(0, 0, 0), at(30, -30, 2)]))?.courseDeg ?? NaN;
    expect(course).toBeCloseTo(bearingDeg(at(0, 0, 0), at(30, -30, 2)), 3);
    let s = INITIAL_BEARING;
    for (let i = 0; i < 30; i++) s = stepBearing(s, { courseDeg: course, speedKmh: 60 });
    expect(s.bearing).toBeGreaterThan(311);
    expect(s.bearing).toBeLessThan(319);
    // marker rotation = heading - mapBearing (map bearing is clockwise from north)
    expect(Math.abs(shortestDelta(s.bearing, course))).toBeLessThan(5);
  });

  it('riding east on a north-up map, the arrow points right; on a map turned east it points up', () => {
    expect(normalizeDeg(90 - 0)).toBe(90);
    expect(normalizeDeg(90 - 90)).toBe(0);
    expect(normalizeDeg(10 - 350)).toBe(20);
  });
});
