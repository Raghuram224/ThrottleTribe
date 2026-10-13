import {
  buildSketch,
  normalizeSketch,
  parseSketches,
  serializeSketches,
  simplifyPoints,
  sketchSegments,
  SKETCH_MAX_POINTS,
} from '../route-sketch';

// A wavy ride ~10 km east and ~2 km north.
const wave = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ lat: 12 + (i / n) * 0.018 + Math.sin(i / 150) * 0.004, lng: 77 + (i / n) * 0.1 }));

describe('simplifyPoints', () => {
  it('returns short input untouched', () => {
    const pts = wave(10);
    expect(simplifyPoints(pts)).toBe(pts);
  });

  it('reduces 2000 samples to at most 48 points, keeping the ends', () => {
    const pts = wave(2000);
    const out = simplifyPoints(pts);
    expect(out.length).toBeLessThanOrEqual(SKETCH_MAX_POINTS);
    expect(out.length).toBeGreaterThan(10);
    expect(out[0]).toBe(pts[0]);
    expect(out[out.length - 1]).toBe(pts[pts.length - 1]);
  });
});

describe('normalizeSketch', () => {
  it('fits a unit box with uniform scale, north up', () => {
    // 0.1 deg east (~10.9 km at lat 12) and 0.01 deg north (~1.1 km): a wide route.
    const out = normalizeSketch([
      { lat: 12, lng: 77 },
      { lat: 12.01, lng: 77.1 },
    ]);
    expect(out).not.toBeNull();
    const [a, b] = out!;
    // West-south start is bottom-left, north-east end is top-right (y flipped).
    expect(a[0]).toBeCloseTo(0, 5);
    expect(b[0]).toBeCloseTo(1, 5);
    expect(a[1]).toBeGreaterThan(b[1]);
    // The route is ~10x wider than tall: it is centred vertically, not stretched.
    expect(Math.abs(a[1] - b[1])).toBeLessThan(0.2);
    expect((a[1] + b[1]) / 2).toBeCloseTo(0.5, 5);
    for (const p of out!) {
      for (const v of p) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns null for fewer than two points or a route that never moved', () => {
    expect(normalizeSketch([{ lat: 12, lng: 77 }])).toBeNull();
    expect(
      normalizeSketch([
        { lat: 12, lng: 77 },
        { lat: 12.00005, lng: 77.00005 },
      ]),
    ).toBeNull();
  });

  it('buildSketch simplifies then normalises', () => {
    const s = buildSketch(wave(1500));
    expect(s).not.toBeNull();
    expect(s!.length).toBeLessThanOrEqual(SKETCH_MAX_POINTS);
  });
});

describe('sketchSegments', () => {
  it('turns points into centred, rotated bars inside the padded box', () => {
    const segs = sketchSegments(
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      56,
      8,
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ cx: 28, cy: 8, length: 40, angleDeg: 0 });
    expect(segs[1]).toMatchObject({ cx: 48, cy: 28, length: 40, angleDeg: 90 });
  });

  it('skips zero-length segments', () => {
    expect(
      sketchSegments(
        [
          [0.5, 0.5],
          [0.5, 0.5],
        ],
        56,
        8,
      ),
    ).toHaveLength(0);
  });
});

describe('sketch storage', () => {
  it('round-trips through the compact format (3 decimals)', () => {
    const raw = serializeSketches({ a: [[0.123456, 0], [1, 0.5]] });
    expect(parseSketches(raw)).toEqual({ a: [[0.123, 0], [1, 0.5]] });
  });

  it('drops malformed entries and survives garbage', () => {
    expect(parseSketches(null)).toEqual({});
    expect(parseSketches('nope')).toEqual({});
    expect(parseSketches('[]')).toEqual({});
    expect(parseSketches(JSON.stringify({ bad: [0.1], odd: [0, 0, 1], range: [0, 0, 2, 1], ok: [0, 0, 1, 1] }))).toEqual({
      ok: [[0, 0], [1, 1]],
    });
  });
});
