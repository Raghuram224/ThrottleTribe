import {
  appendToTrail,
  bearingDeg,
  buildTrail,
  haversineM,
  projectOntoTrail,
  relativePosition,
  type LatLng,
} from '../geo';

// One metre of latitude, on the sphere haversineM uses.
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
/** A point `m` metres north of the origin on the lng = 0 meridian, `eastM` east. */
const pt = (m: number, eastM = 0): LatLng => ({ lat: m / M_PER_DEG, lng: eastM / M_PER_DEG });

/** 2 km straight north, one point every 50 m. */
const line = Array.from({ length: 41 }, (_, i) => pt(i * 50));

describe('haversineM / bearingDeg', () => {
  it('measures a known distance', () => {
    expect(haversineM(pt(0), pt(1000))).toBeCloseTo(1000, 0);
    expect(haversineM(pt(0), pt(0))).toBe(0);
  });

  it('bearings on the compass points', () => {
    expect(bearingDeg(pt(0), pt(100))).toBeCloseTo(0, 3);
    expect(bearingDeg(pt(0), pt(0, 100))).toBeCloseTo(90, 3);
    expect(bearingDeg(pt(100), pt(0))).toBeCloseTo(180, 3);
    expect(bearingDeg(pt(0, 100), pt(0))).toBeCloseTo(270, 3);
  });
});

describe('buildTrail', () => {
  it('empty and single inputs', () => {
    expect(buildTrail([])).toEqual({ points: [], cumulativeM: [], totalM: 0 });
    const one = buildTrail([pt(0)]);
    expect(one.points).toHaveLength(1);
    expect(one.totalM).toBe(0);
  });

  it('downsamples to at least the minimum spacing', () => {
    const dense = Array.from({ length: 101 }, (_, i) => pt(i * 5)); // 5 m spacing, 500 m
    // 19 m minimum on a 5 m grid keeps every 20 m (a 20 m minimum is fragile to float rounding).
    const trail = buildTrail(dense, 19);
    expect(trail.points.length).toBe(26);
    for (let i = 1; i < trail.cumulativeM.length; i++) {
      expect(trail.cumulativeM[i] - trail.cumulativeM[i - 1]).toBeGreaterThanOrEqual(20 - 1e-6);
    }
    expect(trail.totalM).toBeCloseTo(500, 0);
  });

  it('drops duplicate points', () => {
    const trail = buildTrail([pt(0), pt(0), pt(0), pt(100)]);
    expect(trail.points).toHaveLength(2);
    expect(trail.totalM).toBeCloseTo(100, 0);
  });
});

describe('projectOntoTrail', () => {
  const trail = buildTrail(line);

  it('projects onto a straight line', () => {
    const p = projectOntoTrail(trail, pt(730, 0));
    expect(p.alongM).toBeCloseTo(730, 0);
    expect(p.offTrailM).toBeCloseTo(0, 0);
  });

  it('reports perpendicular offset', () => {
    const p = projectOntoTrail(trail, pt(730, 80));
    expect(p.alongM).toBeCloseTo(730, 0);
    expect(p.offTrailM).toBeCloseTo(80, 0);
  });

  it('before the start clamps to 0', () => {
    const p = projectOntoTrail(trail, pt(-150));
    expect(p.alongM).toBe(0);
    expect(p.offTrailM).toBeCloseTo(150, 0);
  });

  it('beyond the end adds the overshoot to the total length', () => {
    const p = projectOntoTrail(trail, pt(2300));
    expect(p.alongM).toBeCloseTo(2300, 0);
    expect(p.offTrailM).toBeCloseTo(0, 0);
  });

  it('far from the trail is off-trail', () => {
    const p = projectOntoTrail(trail, pt(1000, 5000));
    expect(p.offTrailM).toBeCloseTo(5000, -1);
  });

  it('handles a corner by choosing the nearest segment', () => {
    // 1 km north then 1 km east.
    const corner = buildTrail([
      ...Array.from({ length: 21 }, (_, i) => pt(i * 50)),
      ...Array.from({ length: 20 }, (_, i) => pt(1000, (i + 1) * 50)),
    ]);
    const p = projectOntoTrail(corner, pt(1000, 500));
    expect(p.alongM).toBeCloseTo(1500, 0);
    expect(p.offTrailM).toBeLessThan(1);
  });

  it('degenerate trails', () => {
    expect(projectOntoTrail(buildTrail([]), pt(0)).offTrailM).toBe(Infinity);
    const single = projectOntoTrail(buildTrail([pt(0)]), pt(100));
    expect(single.alongM).toBe(0);
    expect(single.offTrailM).toBeCloseTo(100, 0);
  });
});

describe('relativePosition', () => {
  const trail = buildTrail(line);

  it('ahead and behind', () => {
    expect(relativePosition(trail, pt(500), pt(900))).toEqual({
      kind: 'ahead',
      distanceM: expect.closeTo(400, 0),
    });
    expect(relativePosition(trail, pt(900), pt(500))).toEqual({
      kind: 'behind',
      distanceM: expect.closeTo(400, 0),
    });
  });

  it('level when within 100 m', () => {
    expect(relativePosition(trail, pt(500), pt(599)).kind).toBe('level');
    expect(relativePosition(trail, pt(500), pt(601)).kind).toBe('ahead');
    expect(relativePosition(trail, pt(599), pt(500)).kind).toBe('level');
  });

  it('hysteresis: enters "level" below 100 m, leaves only at 150 m', () => {
    // Not level yet: 120 m is ahead.
    expect(relativePosition(trail, pt(500), pt(620), false).kind).toBe('ahead');
    // Already level: 120 m and 149 m stay level, 150 m and beyond do not.
    expect(relativePosition(trail, pt(500), pt(620), true).kind).toBe('level');
    expect(relativePosition(trail, pt(500), pt(649), true).kind).toBe('level');
    expect(relativePosition(trail, pt(500), pt(651), true).kind).toBe('ahead');
    expect(relativePosition(trail, pt(651), pt(500), true).kind).toBe('behind');
  });

  it('away when either rider is more than 500 m off the trail', () => {
    const r = relativePosition(trail, pt(500), pt(900, 600));
    expect(r.kind).toBe('away');
    expect(r.distanceM).toBeCloseTo(Math.hypot(400, 600), 0);
    expect(relativePosition(trail, pt(500, 600), pt(900)).kind).toBe('away');
  });

  it('away with straight-line distance when there is no usable trail', () => {
    expect(relativePosition(null, pt(0), pt(300))).toEqual({ kind: 'away', distanceM: expect.closeTo(300, 0) });
    expect(relativePosition(buildTrail([pt(0)]), pt(0), pt(300)).kind).toBe('away');
  });
});

describe('GPS jumps in the leader trail (ride 2 regression)', () => {
  const T0 = Date.parse('2026-10-10T10:00:00Z');
  /** Stale lobby fix 7 km down the road, then the real start, then 50 m every 3 s up to 1 km. */
  const stale = [
    { ...pt(7000), t: T0 },
    ...Array.from({ length: 21 }, (_, i) => ({ ...pt(i * 50), t: T0 + 10_000 + i * 3000 })),
  ];

  it('drops the stale far point instead of drawing a 7 km segment', () => {
    const trail = buildTrail(stale);
    expect(trail.points[0].lat).toBeCloseTo(0, 6);
    expect(trail.totalM).toBeCloseTo(1000, 0);
    expect(Math.max(...trail.cumulativeM.map((c, i) => (i ? c - trail.cumulativeM[i - 1] : 0)))).toBeLessThan(100);
  });

  it('a rider ahead of the leader is ahead, not 5.7 km behind', () => {
    const trail = buildTrail(stale);
    const rel = relativePosition(trail, pt(900), pt(1100));
    expect(rel.kind).toBe('ahead');
    expect(rel.distanceM).toBeCloseTo(200, -1);
    // Near the old stale point the rider is further ahead of the head, never "behind".
    expect(relativePosition(trail, pt(900), pt(7000)).kind).toBe('ahead');
  });

  it('a single outlier mid-ride is ignored; two agreeing points restart the trail', () => {
    let trail = buildTrail([{ ...pt(0), t: T0 }, { ...pt(50), t: T0 + 3000 }]);
    trail = appendToTrail(trail, { ...pt(9000), t: T0 + 6000 });
    expect(trail.points).toHaveLength(2);
    trail = appendToTrail(trail, { ...pt(100), t: T0 + 9000 });
    expect(trail.points).toHaveLength(3);
    expect(trail.totalM).toBeCloseTo(100, 0);

    // A real jump (e.g. long signal loss): the second point confirms it.
    trail = appendToTrail(trail, { ...pt(9000), t: T0 + 12_000 });
    expect(trail.points).toHaveLength(3);
    trail = appendToTrail(trail, { ...pt(9060), t: T0 + 15_000 });
    expect(trail.points[0].lat).toBeCloseTo(9000 / M_PER_DEG, 8);
    expect(trail.totalM).toBeCloseTo(60, 0);
  });

  it('rejects an implied speed over 200 km/h even for a short step', () => {
    const trail = buildTrail([
      { ...pt(0), t: T0 },
      { ...pt(1500), t: T0 + 10_000 }, // 150 m/s = 540 km/h
      { ...pt(50), t: T0 + 13_000 },
    ]);
    expect(trail.points).toHaveLength(2);
    expect(trail.totalM).toBeCloseTo(50, 0);
  });

  it('prefers beyond-the-end when matched to a far-back segment but beside the head', () => {
    // Out and back on a parallel road: the head ends up beside the start of the trail.
    const loop = buildTrail([pt(0), pt(500), pt(1000), pt(1000, 30), pt(500, 30), pt(60, 30)]);
    const p = projectOntoTrail(loop, pt(50, 10));
    expect(p.alongM).toBeGreaterThan(loop.totalM - 50);
  });
});
