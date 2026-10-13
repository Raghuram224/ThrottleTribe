import {
  BEARING_DEADBAND_DEG,
  centerPadding,
  effectiveMode,
  followPadding,
  followPitch,
  INITIAL_BEARING,
  overviewPadding,
  reduceCamera,
  shortestDelta,
  smoothZoom,
  stepBearing,
  validCourse,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomForSpeed,
  type BearingState,
  type CameraMode,
} from '../nav-camera';

describe('zoomForSpeed', () => {
  it('is 17.5 when crawling, 16.5 at city speed, 15.5 on the open road', () => {
    expect(zoomForSpeed(0)).toBe(17.5);
    expect(zoomForSpeed(14)).toBe(17.5);
    expect(zoomForSpeed(30)).toBeCloseTo(16.5);
    expect(zoomForSpeed(45)).toBeCloseTo(16.5);
    expect(zoomForSpeed(60)).toBeCloseTo(16.5);
    expect(zoomForSpeed(80)).toBeCloseTo(15.5);
    expect(zoomForSpeed(140)).toBe(15.5);
  });
  it('interpolates linearly between the stops', () => {
    expect(zoomForSpeed(22.5)).toBeCloseTo(17.0);
    expect(zoomForSpeed(70)).toBeCloseTo(16.0);
  });
  it('is monotonic non-increasing and clamped', () => {
    let prev = Infinity;
    for (let v = 0; v <= 160; v += 2) {
      const z = zoomForSpeed(v);
      expect(z).toBeLessThanOrEqual(prev);
      expect(z).toBeGreaterThanOrEqual(ZOOM_MIN);
      expect(z).toBeLessThanOrEqual(ZOOM_MAX);
      prev = z;
    }
  });
  it('uses a middle zoom when the speed is unknown', () => {
    expect(zoomForSpeed(null)).toBe(17);
    expect(zoomForSpeed(NaN)).toBe(17);
  });
});

describe('smoothZoom', () => {
  it('starts at the target and clamps', () => {
    expect(smoothZoom(null, 16.2)).toBe(16.2);
    expect(smoothZoom(null, 20)).toBe(ZOOM_MAX);
    expect(smoothZoom(null, 10)).toBe(ZOOM_MIN);
  });
  it('moves part of the way and ignores tiny changes', () => {
    expect(smoothZoom(17, 16)).toBeCloseTo(16.7);
    expect(smoothZoom(17, 16.95)).toBe(17);
  });
  it('converges', () => {
    let z = 17.5;
    for (let i = 0; i < 40; i++) z = smoothZoom(z, 15.5);
    expect(z).toBeLessThan(15.6);
  });
});

describe('bearing', () => {
  const at = (bearing: number, tracking = false): BearingState => ({ bearing, tracking });

  it('shortest delta wraps through north', () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    expect(shortestDelta(0, 180)).toBe(-180);
    expect(shortestDelta(90, 90)).toBe(0);
  });

  it('validCourse rejects -1, null and NaN', () => {
    expect(validCourse(-1)).toBe(false);
    expect(validCourse(null)).toBe(false);
    expect(validCourse(NaN)).toBe(false);
    expect(validCourse(0)).toBe(true);
    expect(validCourse(359)).toBe(true);
  });

  it('keeps the last bearing when stopped or slow, however the course reads', () => {
    const s = at(120);
    expect(stepBearing(s, { courseDeg: 300, speedKmh: 0 }).bearing).toBe(120);
    expect(stepBearing(s, { courseDeg: 300, speedKmh: 7.9 }).bearing).toBe(120);
    expect(stepBearing(s, { courseDeg: 300, speedKmh: null }).bearing).toBe(120);
  });

  it('keeps the last bearing without a valid course', () => {
    expect(stepBearing(at(120), { courseDeg: -1, speedKmh: 40 }).bearing).toBe(120);
    expect(stepBearing(at(120), { courseDeg: null, speedKmh: 40 }).bearing).toBe(120);
  });

  it('turns towards the course along the short way when moving', () => {
    const next = stepBearing(at(350), { courseDeg: 30, speedKmh: 40 });
    expect(next.tracking).toBe(true);
    // 40 deg short way, 40 % of it: 350 + 16 = 6.
    expect(next.bearing).toBeCloseTo(6);
  });

  it('ignores course jitter inside the deadband', () => {
    const next = stepBearing(at(100, true), { courseDeg: 100 + BEARING_DEADBAND_DEG - 1, speedKmh: 40 });
    expect(next.bearing).toBe(100);
  });

  it('has speed hysteresis: enters at 8 km/h, stays tracking down to 5', () => {
    let s = stepBearing(at(0), { courseDeg: 90, speedKmh: 8 });
    expect(s.tracking).toBe(true);
    s = stepBearing(s, { courseDeg: 90, speedKmh: 6 });
    expect(s.tracking).toBe(true);
    expect(s.bearing).toBeGreaterThan(0);
    const held = stepBearing(s, { courseDeg: 270, speedKmh: 4 });
    expect(held.tracking).toBe(false);
    expect(held.bearing).toBe(s.bearing);
    // Below 8 again after dropping out: not tracking until 8.
    expect(stepBearing(held, { courseDeg: 270, speedKmh: 7 }).tracking).toBe(false);
  });

  it('converges on a steady course and never leaves 0..360', () => {
    let s = INITIAL_BEARING;
    for (let i = 0; i < 40; i++) s = stepBearing(s, { courseDeg: 359, speedKmh: 50 });
    expect(Math.abs(shortestDelta(s.bearing, 359))).toBeLessThan(BEARING_DEADBAND_DEG);
    expect(s.bearing).toBeGreaterThanOrEqual(0);
    expect(s.bearing).toBeLessThan(360);
  });
});

describe('camera mode reducer', () => {
  const run = (start: CameraMode, ...types: Parameters<typeof reduceCamera>[1]['type'][]) =>
    types.reduce<CameraMode>((m, type) => reduceCamera(m, { type }), start);

  it('starts following; a gesture goes free; re-centre returns to follow', () => {
    expect(run('follow', 'gesture')).toBe('free');
    expect(run('follow', 'gesture', 'recenter')).toBe('follow');
  });
  it('show all is overview and stays overview until re-centre', () => {
    expect(run('follow', 'showAll')).toBe('overview');
    expect(run('overview', 'showAll')).toBe('overview');
    expect(run('overview', 'recenter')).toBe('follow');
  });
  it('a gesture in overview goes free; tapping a rider goes free', () => {
    expect(run('overview', 'gesture')).toBe('free');
    expect(run('follow', 'focusRider')).toBe('free');
    expect(run('free', 'focusRider')).toBe('free');
  });
  it('without my location follow degrades to overview, free stays free', () => {
    expect(effectiveMode('follow', false)).toBe('overview');
    expect(effectiveMode('overview', false)).toBe('overview');
    expect(effectiveMode('free', false)).toBe('free');
    expect(effectiveMode('follow', true)).toBe('follow');
    expect(effectiveMode('free', true)).toBe('free');
  });
});

describe('padding', () => {
  it('puts me in the lower third of the uncovered map', () => {
    const areaH = 700;
    const topInset = 84;
    const bottomInset = 315; // half sheet
    const p = followPadding({ areaH, topInset, bottomInset });
    const visible = areaH - topInset - bottomInset; // 301
    const centreY = p.top + (areaH - p.top - p.bottom) / 2;
    const fromVisibleTop = centreY - topInset;
    expect(p.bottom).toBe(315);
    expect(fromVisibleTop / visible).toBeCloseTo(2 / 3, 1);
  });
  it('follows the sheet: a taller sheet pushes the padding', () => {
    const half = followPadding({ areaH: 700, topInset: 84, bottomInset: 315 });
    const peek = followPadding({ areaH: 700, topInset: 84, bottomInset: 72 });
    expect(peek.bottom).toBeLessThan(half.bottom);
    expect(peek.top).toBeGreaterThan(half.top);
  });
  it('never lets chrome and sheet swallow the map', () => {
    const p = followPadding({ areaH: 700, topInset: 84, bottomInset: 600 });
    expect(700 - 84 - p.bottom).toBeGreaterThanOrEqual(120);
    expect(p.top + p.bottom).toBeLessThan(700);
    const o = overviewPadding({ areaH: 700, topInset: 84, bottomInset: 600 });
    expect(700 - o.top - o.bottom).toBeGreaterThan(0);
  });
  it('overview keeps a margin for markers and the attribution pill', () => {
    const o = overviewPadding({ areaH: 700, topInset: 0, bottomInset: 100 });
    expect(o).toEqual({ top: 48, right: 48, bottom: 176, left: 48 });
  });
  it('centre padding covers only chrome and sheet', () => {
    expect(centerPadding({ areaH: 700, topInset: 84, bottomInset: 200 })).toEqual({ top: 84, right: 0, bottom: 200, left: 0 });
  });
  it('tilt preference', () => {
    expect(followPitch(true)).toBe(45);
    expect(followPitch(false)).toBe(0);
  });
});
