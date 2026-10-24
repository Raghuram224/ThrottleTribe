import { haversineM, type LatLng } from '../geo';
import { clampRouteIndex, LABEL_MIN_GAP_M, mapRouteViews, routeChoices, routeLabelAnchors } from '../route-choices';

// A straight road east from A (0.01 deg lng is about 1.1 km at lat 12.9).
const line = (lat: number, fromLng: number, toLng: number, n = 41): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat, lng: fromLng + ((toLng - fromLng) * i) / (n - 1) }));
const A = 77.5;
const B = 77.9;
// Two roads sharing the first and last 25%, the middle swinging 0.05 deg (about 5.5 km) north.
const via = (swing: number): LatLng[] => {
  const pts: LatLng[] = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const bump = f < 0.25 || f > 0.75 ? 0 : Math.sin(((f - 0.25) / 0.5) * Math.PI) * swing;
    pts.push({ lat: 12.9 + bump, lng: A + (B - A) * f });
  }
  return pts;
};

describe('clampRouteIndex', () => {
  it('keeps a valid selection and falls back to the first route otherwise', () => {
    expect(clampRouteIndex(1, 3)).toBe(1);
    expect(clampRouteIndex(3, 3)).toBe(0);
    expect(clampRouteIndex(-1, 3)).toBe(0);
    expect(clampRouteIndex(Number.NaN, 3)).toBe(0);
    expect(clampRouteIndex(0, 0)).toBe(0);
  });
});

describe('routeChoices', () => {
  const now = Date.UTC(2026, 9, 24, 12, 0, 0);
  const c = routeChoices(
    [
      { distanceM: 31_400, durationS: 42 * 60 + 20 },
      { distanceM: 35_000, durationS: 50 * 60 },
    ],
    now,
  );
  it('one choice per route: "42 min · 31 km", first tagged Fastest', () => {
    expect(c.map((x) => x.label)).toEqual(['42 min · 31 km', '50 min · 35 km']);
    expect(c.map((x) => x.fastest)).toEqual([true, false]);
  });
  it('carries the arrival time of each (from `now` plus its own duration)', () => {
    expect(c[0].arrive).not.toBe(c[1].arrive);
    expect(c[0].arrive).toMatch(/\d/);
  });
  it('speaks duration, distance and arrival, and the tag only on the first, with no symbols', () => {
    expect(c[0].a11y).toContain('Fastest');
    expect(c[1].a11y).not.toContain('Fastest');
    expect(c[0].a11y).toContain('Arrive about');
    expect(c[0].a11y).not.toMatch(/[·]/);
  });
  it('no routes, no choices', () => {
    expect(routeChoices([], now)).toEqual([]);
  });
});

describe('mapRouteViews: the chosen route is drawn last, on top', () => {
  const routes = [{ coords: line(12.9, A, B) }, { coords: line(12.95, A, B) }, { coords: line(13, A, B) }];
  it('puts the unselected first (in order), then the selected', () => {
    expect(mapRouteViews(routes, 0).map((v) => [v.index, v.selected])).toEqual([
      [1, false],
      [2, false],
      [0, true],
    ]);
    expect(mapRouteViews(routes, 2).map((v) => [v.index, v.selected])).toEqual([
      [0, false],
      [1, false],
      [2, true],
    ]);
  });
  it('an out-of-range selection is the first route', () => {
    expect(mapRouteViews(routes, 9).find((v) => v.selected)?.index).toBe(0);
  });
  it('no routes, nothing to draw', () => {
    expect(mapRouteViews([], 0)).toEqual([]);
  });
});

describe('routeLabelAnchors: labels sit where the lines differ', () => {
  it('a single route is labelled at its middle', () => {
    const r = { coords: line(12.9, A, B) };
    const [p] = routeLabelAnchors([r]);
    expect(p?.lat).toBeCloseTo(12.9, 5);
    expect(p?.lng).toBeCloseTo((A + B) / 2, 3);
  });
  it('two routes that share their ends are labelled in the diverging middle, far from the other line', () => {
    const north = { coords: via(0.05) };
    const south = { coords: via(-0.05) };
    const [pn, ps] = routeLabelAnchors([north, south]);
    expect(pn && ps).toBeTruthy();
    // Each label is well clear of the other route (not on the shared start or end).
    const nearest = (p: LatLng, route: LatLng[]) => Math.min(...route.map((q) => haversineM(p, q)));
    expect(nearest(pn as LatLng, south.coords)).toBeGreaterThan(2000);
    expect(nearest(ps as LatLng, north.coords)).toBeGreaterThan(2000);
    // And on its own route.
    expect(nearest(pn as LatLng, north.coords)).toBeLessThan(300);
    expect(nearest(ps as LatLng, south.coords)).toBeLessThan(300);
  });
  it('three routes get three labels apart from one another', () => {
    const rs = [{ coords: via(0.05) }, { coords: via(-0.05) }, { coords: via(0.02) }];
    const ps = routeLabelAnchors(rs) as LatLng[];
    expect(ps).toHaveLength(3);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(haversineM(ps[i], ps[j])).toBeGreaterThanOrEqual(LABEL_MIN_GAP_M);
  });
  it('alternatives that share a long start put their labels where they part, not stacked on the shared stretch (D3)', () => {
    // Both share the first 60%; then they part by 0.03 deg (about 3.3 km) either way.
    const part = (swing: number): LatLng[] => {
      const pts: LatLng[] = [];
      for (let i = 0; i <= 60; i++) {
        const f = i / 60;
        const bump = f < 0.6 ? 0 : Math.sin(((f - 0.6) / 0.4) * (Math.PI / 2)) * swing;
        pts.push({ lat: 12.9 + bump, lng: A + (B - A) * f });
      }
      return pts;
    };
    const a = part(0.03);
    const b = part(-0.03);
    const [pa, pb] = routeLabelAnchors([{ coords: a }, { coords: b }]) as LatLng[];
    const nearest = (p: LatLng, route: LatLng[]) => Math.min(...route.map((q) => haversineM(p, q)));
    // Each is on the part where the other route is far away.
    expect(nearest(pa, b)).toBeGreaterThan(1500);
    expect(nearest(pb, a)).toBeGreaterThan(1500);
    // And the pills do not overlap: further apart than 12% of the extent.
    const extent = haversineM(a[0], a[a.length - 1]);
    expect(haversineM(pa, pb)).toBeGreaterThanOrEqual(extent * 0.12);
  });
  it('identical geometry cannot put two pills on one spot: the second is nudged apart', () => {
    const r = { coords: line(12.9, A, B) };
    const [p1, p2] = routeLabelAnchors([r, r]) as LatLng[];
    expect(haversineM(p1, p2)).toBeGreaterThanOrEqual(LABEL_MIN_GAP_M);
  });
  it('a route with fewer than two points has no label; the others are still placed', () => {
    const out = routeLabelAnchors([{ coords: [] }, { coords: line(12.9, A, B) }]);
    expect(out[0]).toBeNull();
    expect(out[1]).not.toBeNull();
  });
  it('no routes, no labels', () => {
    expect(routeLabelAnchors([])).toEqual([]);
  });
});
