import { fetchNavRoute, parseOsrmResponse, remainingToStop, shouldReroute, stopCardText, stopGlyph, type NavRoute } from '../nav-route';

// A straight 10 km road going east along the equator-ish line (0.0009 deg lng ~ 100 m at lat 12).
const M_PER_DEG_LNG = 111_320 * Math.cos((12 * Math.PI) / 180);
const lngAt = (m: number) => 77 + m / M_PER_DEG_LNG;
const coords = Array.from({ length: 11 }, (_, i) => ({ lat: 12, lng: lngAt(i * 1000) }));
const route: NavRoute = { coords, distanceM: 10_000, durationS: 600 };
const stop = { lat: 12, lng: lngAt(10_000) };
const at = (m: number, offLatM = 0) => ({ lat: 12 + offLatM / 111_320, lng: lngAt(m) });

describe('parseOsrmResponse', () => {
  it('reads geometry, distance and duration', () => {
    const r = parseOsrmResponse({
      routes: [{ distance: 1234.5, duration: 99, geometry: { coordinates: [[77.1, 12.1], [77.2, 12.2]] } }],
    });
    expect(r).toEqual({ coords: [{ lat: 12.1, lng: 77.1 }, { lat: 12.2, lng: 77.2 }], distanceM: 1234.5, durationS: 99 });
  });
  it('returns null for empty or malformed responses', () => {
    expect(parseOsrmResponse({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseOsrmResponse(null)).toBeNull();
    expect(parseOsrmResponse({ routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }] })).toBeNull();
    expect(parseOsrmResponse({ routes: [{ distance: 'x', duration: 1, geometry: { coordinates: [[1, 2], [3, 4]] } }] })).toBeNull();
  });
});

describe('fetchNavRoute', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  it('returns null instead of throwing when the request fails', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(fetchNavRoute({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).resolves.toBeNull();
  });
  it('calls OSRM with lng,lat order and returns the route', async () => {
    const f = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ routes: [{ distance: 5, duration: 6, geometry: { coordinates: [[1, 2], [3, 4]] } }] }),
    });
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await fetchNavRoute({ lat: 12, lng: 77 }, { lat: 13, lng: 78 });
    expect(r?.distanceM).toBe(5);
    expect(f.mock.calls[0][0]).toBe('https://router.project-osrm.org/route/v1/driving/77,12;78,13?overview=full&geometries=geojson');
  });
});

describe('shouldReroute', () => {
  const now = 1_000_000;
  it('is false while on the route', () => {
    expect(shouldReroute(at(3000, 50), route, now - 120_000, now)).toBe(false);
  });
  it('is true when more than 150 m off and a minute has passed', () => {
    expect(shouldReroute(at(3000, 200), route, now - 61_000, now)).toBe(true);
  });
  it('is rate limited to once per 60 s', () => {
    expect(shouldReroute(at(3000, 500), route, now - 59_000, now)).toBe(false);
  });
  it('re-routes within 5 s when more than 1 km off (wrong turn, GPS jump, stale route)', () => {
    expect(shouldReroute(at(3000, 1500), route, now - 6_000, now)).toBe(true);
    expect(shouldReroute(at(3000, 1500), route, now - 3_000, now)).toBe(false);
  });
  it('fetches when there is no route yet (after the rate limit)', () => {
    expect(shouldReroute(at(0), null, 0, now)).toBe(true);
    expect(shouldReroute(at(0), null, now - 10_000, now)).toBe(false);
  });
});

describe('remainingToStop', () => {
  it('scales distance and ETA by progress along the route', () => {
    const r = remainingToStop(at(5000), stop, route);
    expect(r.approximate).toBe(false);
    expect(r.distanceM).toBeGreaterThan(4900);
    expect(r.distanceM).toBeLessThan(5100);
    expect(r.durationS).toBeGreaterThan(290);
    expect(r.durationS).toBeLessThan(310);
  });
  it('falls back to the straight line without a route', () => {
    const r = remainingToStop(at(0), stop, null);
    expect(r).toMatchObject({ durationS: null, approximate: true });
    expect(r.distanceM).toBeGreaterThan(9900);
  });
});

describe('stopCardText', () => {
  const base = { name: 'Cafe Coffee Day', kind: 'break', stop };
  it('shows distance and ETA along the road', () => {
    expect(stopCardText({ ...base, me: at(6600), route })).toEqual({
      text: '☕ Cafe Coffee Day · 3.4 km · 3 min',
      arrived: false,
    });
  });
  it('falls back to an approximate distance without a route', () => {
    expect(stopCardText({ ...base, me: at(6600), route: null })).toEqual({
      text: '☕ Cafe Coffee Day · ≈ 3.4 km',
      arrived: false,
    });
  });
  it('says arrived within 150 m and does not need a route', () => {
    expect(stopCardText({ ...base, me: at(9900), route: null })).toEqual({ text: "You've arrived", arrived: true });
    expect(stopCardText({ ...base, me: at(9800), route }).arrived).toBe(false);
  });
  it('shows only the name until my position is known; destination uses the flag glyph', () => {
    expect(stopCardText({ ...base, me: null, route: null }).text).toBe('☕ Cafe Coffee Day');
    expect(stopCardText({ ...base, kind: 'destination', me: null, route: null }).text).toBe('🏁 Cafe Coffee Day');
    expect(stopGlyph('break')).toBe('☕');
  });
});
