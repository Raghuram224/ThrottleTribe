import {
  bearingsParam,
  buildOsrmUrl,
  excludeKnownUnsupported,
  excludeRejected,
  EXCLUDE_UNSUPPORTED_MEMO_MS,
  fetchNavRoute,
  fetchNavRouteResult,
  parseOsrmResponse,
  remainingToStop,
  resetRoutingMemo,
  routeCacheKey,
  setExcludeRejectedListener,
  shouldReroute,
  stopCardA11y,
  stopCardText,
  type NavRoute,
} from '../nav-route';
import { engineRemaining, initProgress } from '../nav-progress';
import { prepared, straightRoute } from '../__fixtures__/nav-fixtures';

// The public demo does not honour exclude; most tests run as if a router that does (flag on).
let mockSupportsExclude = true;
jest.mock('../flags', () => ({
  ROUTING_URL: 'https://router.project-osrm.org/route/v1/driving',
  get ROUTING_SUPPORTS_EXCLUDE() {
    return mockSupportsExclude;
  },
}));
const mockRejected = jest.fn();
beforeEach(() => {
  mockSupportsExclude = true;
  mockRejected.mockClear();
  setExcludeRejectedListener(mockRejected);
});

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
  beforeEach(() => resetRoutingMemo());
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
  it('splits distance and ETA along the road, chip text has no emoji', () => {
    expect(stopCardText({ ...base, me: at(6600), route })).toEqual({
      distance: '3.4 km',
      km: '3.4 km',
      eta: '3 min',
      approximate: false,
      arrived: false,
      name: 'Cafe Coffee Day',
      kind: 'break',
      text: 'Cafe Coffee Day · 3.4 km · 3 min',
    });
  });
  it('falls back to an approximate distance without a route', () => {
    expect(stopCardText({ ...base, me: at(6600), route: null })).toEqual({
      distance: '≈ 3.4 km',
      km: '3.4 km',
      eta: null,
      approximate: true,
      arrived: false,
      name: 'Cafe Coffee Day',
      kind: 'break',
      text: 'Cafe Coffee Day · ≈ 3.4 km',
    });
  });
  it('says arrived within 150 m and does not need a route', () => {
    const r = stopCardText({ ...base, me: at(9900), route: null });
    expect(r).toMatchObject({ arrived: true, distance: null, eta: null, text: "You've arrived" });
    expect(stopCardText({ ...base, me: at(9800), route }).arrived).toBe(false);
  });
  it('takes arrived from the caller (the latch) when given, in both directions', () => {
    // Latched: stays arrived after riding on, even without a fix.
    expect(stopCardText({ ...base, me: at(5000), route, arrived: true })).toMatchObject({ arrived: true, text: "You've arrived" });
    expect(stopCardText({ ...base, me: null, route, arrived: true }).arrived).toBe(true);
    // Not latched (e.g. the fix was too inaccurate to count): the card must not say arrived on its own.
    const r = stopCardText({ ...base, me: at(9900), route: null, arrived: false });
    expect(r.arrived).toBe(false);
    expect(r.distance).not.toBeNull();
  });
  it('has only the name until my position is known', () => {
    expect(stopCardText({ ...base, me: null, route: null })).toMatchObject({
      distance: null,
      km: null,
      eta: null,
      arrived: false,
      text: 'Cafe Coffee Day',
    });
    expect(stopCardText({ ...base, kind: 'destination', me: null, route: null }).kind).toBe('destination');
  });
});

describe('stopCardA11y', () => {
  const base = { name: 'Cafe', kind: 'break', stop };
  it('reads distance and ETA, or the name alone, or arrival', () => {
    expect(stopCardA11y(stopCardText({ ...base, me: at(6600), route }), null)).toBe(
      'Next stop Cafe, 3.4 km, 3 min. Double-tap to show it on the map.',
    );
    // No route: the label says "about", never the "≈" glyph.
    expect(stopCardA11y(stopCardText({ ...base, me: at(6600), route: null }), null)).toMatch(
      /^Next stop Cafe, about [\d.]+ km\. Double-tap/,
    );
    expect(stopCardA11y(stopCardText({ ...base, me: at(6600), route: null }), null)).not.toContain('≈');
    expect(stopCardA11y(stopCardText({ ...base, me: null, route: null }), null)).toBe(
      'Next stop Cafe. Double-tap to show it on the map.',
    );
    expect(stopCardA11y(stopCardText({ ...base, me: at(9900), route: null }), 'Priya')).toBe(
      "Next stop Cafe, you've arrived. Double-tap to show it on the map. Suggested by Priya.",
    );
  });
});

describe('buildOsrmUrl', () => {
  const from = { lat: 12.9716, lng: 77.5946 };
  const to = { lat: 12.2958, lng: 76.6394 };
  const base = 'https://router.project-osrm.org/route/v1/driving/77.5946,12.9716;76.6394,12.2958?overview=full&geometries=geojson';
  it('is the plain route without options', () => {
    expect(buildOsrmUrl(from, to)).toBe(base);
    expect(buildOsrmUrl(from, to, { avoidMotorways: false, steps: false, bearingDeg: null })).toBe(base);
  });
  it('adds steps, exclude and bearings in that order', () => {
    expect(buildOsrmUrl(from, to, { steps: true })).toBe(`${base}&steps=true`);
    expect(buildOsrmUrl(from, to, { avoidMotorways: true })).toBe(`${base}&exclude=motorway`);
    expect(buildOsrmUrl(from, to, { bearingDeg: 271.6 })).toBe(`${base}&bearings=272,45;`);
    expect(buildOsrmUrl(from, to, { steps: true, avoidMotorways: true, bearingDeg: 90 })).toBe(
      `${base}&steps=true&exclude=motorway&bearings=90,45;`,
    );
  });
  it('wraps a negative bearing into 0-359', () => {
    expect(buildOsrmUrl(from, to, { bearingDeg: -90 })).toContain('&bearings=270,45;');
  });
});

describe('exclude fallback decision', () => {
  // The real public-demo answer to exclude=motorway (checked 2026-10-13).
  const demo = { code: 'InvalidValue', message: 'Exclude flag combination is not supported.' };
  it('treats HTTP 400 InvalidValue about exclude as a rejection, only when exclude was sent', () => {
    expect(excludeRejected(400, demo, true)).toBe(true);
    // Any other bad value (a bearings value, P2) is not about exclude and must not disable avoidance.
    expect(excludeRejected(400, { code: 'InvalidValue', message: 'Invalid bearings parameter' }, true)).toBe(false);
    expect(excludeRejected(400, { code: 'InvalidValue' }, true)).toBe(false);
    expect(excludeRejected(400, { message: 'bad exclude class' }, true)).toBe(false);
    expect(excludeRejected(400, demo, false)).toBe(false);
    expect(excludeRejected(200, demo, true)).toBe(false);
    expect(excludeRejected(500, demo, true)).toBe(false);
    expect(excludeRejected(400, { code: 'InvalidQuery', message: 'Query string malformed' }, true)).toBe(false);
    expect(excludeRejected(400, null, true)).toBe(false);
  });
  it('remembers a rejection for 30 minutes', () => {
    expect(excludeKnownUnsupported(1000, null)).toBe(false);
    expect(excludeKnownUnsupported(1000 + EXCLUDE_UNSUPPORTED_MEMO_MS - 1, 1000)).toBe(true);
    expect(excludeKnownUnsupported(1000 + EXCLUDE_UNSUPPORTED_MEMO_MS, 1000)).toBe(false);
  });
});

describe('fetchNavRouteResult', () => {
  const realFetch = globalThis.fetch;
  const a = { lat: 12.9716, lng: 77.5946 };
  const b = { lat: 12.2958, lng: 76.6394 };
  const okBody = { routes: [{ distance: 5, duration: 6, geometry: { coordinates: [[1, 2], [3, 4]] } }] };
  const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
  const mockFetch = (...replies: ReturnType<typeof reply>[]) => {
    const f = jest.fn();
    for (const r of replies) f.mockResolvedValueOnce(r);
    globalThis.fetch = f as unknown as typeof fetch;
    return f;
  };
  beforeEach(() => resetRoutingMemo());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends exclude=motorway and marks the route avoided when the server accepts it', async () => {
    const f = mockFetch(reply(200, okBody));
    const r = await fetchNavRouteResult(a, b, { avoidMotorways: true });
    expect(r).toMatchObject({ status: 'ok', route: { avoidedMotorways: true } });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain('&exclude=motorway');
  });
  it('retries once without exclude when rejected, and marks avoidedMotorways false', async () => {
    const f = mockFetch(
      reply(400, { code: 'InvalidValue', message: 'Exclude flag combination is not supported.' }),
      reply(200, okBody),
    );
    const r = await fetchNavRouteResult(a, b, { avoidMotorways: true });
    expect(r).toMatchObject({ status: 'ok', route: { avoidedMotorways: false } });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toContain('exclude=motorway');
    expect(f.mock.calls[1][0]).not.toContain('exclude');
  });
  it('skips the doomed first request for a while after a rejection', async () => {
    mockFetch(reply(400, { code: 'InvalidValue', message: 'Exclude flag combination is not supported.' }), reply(200, okBody));
    await fetchNavRouteResult(a, b, { avoidMotorways: true });
    expect(mockRejected).toHaveBeenCalledTimes(1);
    const f = mockFetch(reply(200, okBody));
    const r = await fetchNavRouteResult({ lat: 13, lng: 77 }, b, { avoidMotorways: true });
    expect(r).toMatchObject({ status: 'ok', route: { avoidedMotorways: false } });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).not.toContain('exclude');
  });
  it('leaves avoidedMotorways unset when it was not asked for', async () => {
    mockFetch(reply(200, okBody));
    const r = await fetchNavRouteResult(a, b, {});
    expect(r.status === 'ok' && r.route.avoidedMotorways).toBeUndefined();
  });
  it('tells no route (OSRM NoRoute) from a failure', async () => {
    mockFetch(reply(200, { code: 'NoRoute', routes: [] }));
    await expect(fetchNavRouteResult(a, b, {})).resolves.toEqual({ status: 'no_route' });
    mockFetch(reply(500, { code: 'Error' }));
    await expect(fetchNavRouteResult({ lat: 1, lng: 1 }, b, {})).resolves.toEqual({ status: 'failed' });
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(fetchNavRouteResult({ lat: 2, lng: 2 }, b, {})).resolves.toEqual({ status: 'failed' });
  });
  it('caches a route so a back-and-forth does not refetch, and keys on the options', async () => {
    const f = mockFetch(reply(200, okBody), reply(200, okBody));
    await fetchNavRouteResult(a, b, {});
    await fetchNavRouteResult(a, b, {});
    expect(f).toHaveBeenCalledTimes(1);
    await fetchNavRouteResult(a, b, { steps: true });
    expect(f).toHaveBeenCalledTimes(2);
    expect(routeCacheKey(a, b, {})).not.toBe(routeCacheKey(a, b, { avoidMotorways: true }));
  });
  it('does not take another 400 for an exclude rejection: a failed route, memo untouched', async () => {
    mockFetch(reply(400, { code: 'InvalidValue', message: 'Invalid bearings parameter' }));
    await expect(fetchNavRouteResult(a, b, { avoidMotorways: true })).resolves.toEqual({ status: 'failed' });
    const f = mockFetch(reply(200, okBody));
    await fetchNavRouteResult({ lat: 13, lng: 77 }, b, { avoidMotorways: true });
    expect(f.mock.calls[0][0]).toContain('exclude=motorway');
    expect(mockRejected).not.toHaveBeenCalled();
  });

  describe('router that cannot exclude (flag off, the default)', () => {
    beforeEach(() => {
      mockSupportsExclude = false;
    });
    it('never sends exclude, in one request, and leaves avoidedMotorways unset', async () => {
      const f = mockFetch(reply(200, okBody));
      const r = await fetchNavRouteResult(a, b, { avoidMotorways: true });
      expect(f).toHaveBeenCalledTimes(1);
      expect(f.mock.calls[0][0]).not.toContain('exclude');
      expect(r.status === 'ok' && r.route.avoidedMotorways).toBeUndefined();
    });
    it('drops the avoid flag from the cache key, so flipping the switch back is a cache hit', async () => {
      expect(routeCacheKey(a, b, { avoidMotorways: true })).toBe(routeCacheKey(a, b, {}));
      const f = mockFetch(reply(200, okBody), reply(200, okBody));
      await fetchNavRouteResult(a, b, { avoidMotorways: true });
      await fetchNavRouteResult(a, b, { avoidMotorways: false });
      expect(f).toHaveBeenCalledTimes(1);
    });
  });

  it('with exclude supported, flipping the switch back within the cache window is a cache hit', async () => {
    const f = mockFetch(reply(200, okBody), reply(200, okBody));
    await fetchNavRouteResult(a, b, { avoidMotorways: true });
    await fetchNavRouteResult(a, b, { avoidMotorways: false });
    expect(f).toHaveBeenCalledTimes(2);
    await fetchNavRouteResult(a, b, { avoidMotorways: true });
    await fetchNavRouteResult(a, b, { avoidMotorways: false });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('after a rejection the avoid flag stops mattering to the cache key too', async () => {
    mockFetch(reply(400, { code: 'InvalidValue', message: 'Exclude flag combination is not supported.' }), reply(200, okBody));
    await fetchNavRouteResult(a, b, { avoidMotorways: true });
    expect(routeCacheKey(a, b, { avoidMotorways: true })).toBe(routeCacheKey(a, b, {}));
  });
});

describe('M4: noCache (engine requests)', () => {
  const realFetch = globalThis.fetch;
  const a = { lat: 12.9716, lng: 77.5946 };
  const b = { lat: 12.2958, lng: 76.6394 };
  const okBody = { routes: [{ distance: 5, duration: 6, geometry: { coordinates: [[1, 2], [3, 4]] } }] };
  const ok = () => ({ ok: true, status: 200, json: () => Promise.resolve(okBody) });
  beforeEach(() => resetRoutingMemo());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  it('a noCache request neither reads nor fills the cache, so a reroute is a real request', async () => {
    const f = jest.fn().mockResolvedValue(ok());
    globalThis.fetch = f as unknown as typeof fetch;
    await fetchNavRouteResult(a, b, { steps: true }); // the preview fills the cache
    await fetchNavRouteResult({ lat: a.lat + 0.0001, lng: a.lng }, b, { steps: true, noCache: true }); // same 3 dp cell
    expect(f).toHaveBeenCalledTimes(2);
    await fetchNavRouteResult(a, b, { steps: true }); // the preview still hits its own entry
    expect(f).toHaveBeenCalledTimes(2);
    await fetchNavRouteResult({ lat: 1, lng: 1 }, b, { steps: true, noCache: true });
    await fetchNavRouteResult({ lat: 1, lng: 1 }, b, { steps: true });
    expect(f).toHaveBeenCalledTimes(4);
  });
  it('the option is not part of the request or the cache key', () => {
    expect(routeCacheKey(a, b, { noCache: true })).toBe(routeCacheKey(a, b, {}));
    expect(buildOsrmUrl(a, b, { noCache: true })).toBe(buildOsrmUrl(a, b, {}));
  });
});

describe('M5: stop card from engine progress', () => {
  const road = { coords: [{ lat: 12, lng: 77 }, { lat: 12, lng: 77.0275 }], distanceM: 3000, durationS: 300 };
  it('uses the given remaining distance and ETA instead of projecting my position again', () => {
    const me = { lat: 12, lng: 77.0165 }; // ~1800 m along: the card alone would say about 1.2 km
    const stop = { lat: 12, lng: 77.0275 };
    const alone = stopCardText({ name: 'X', kind: null, me, stop, route: road, arrived: false });
    const engine = stopCardText({
      name: 'X',
      kind: null,
      me,
      stop,
      route: road,
      arrived: false,
      remaining: engineRemaining(
        { ...initProgress(1), alongM: 2000, joined: true },
        prepared(straightRoute(3000, [])),
      ),
    });
    expect(alone.km).not.toBe(engine.km);
    expect(engine.km).toBe('1.0 km');
    expect(engine.eta).toBe('1 min');
  });
});

describe('bearingsParam', () => {
  it('is a whole 0..359 start heading with the 45 degree range and an empty second waypoint', () => {
    expect(bearingsParam(90)).toBe('&bearings=90,45;');
    expect(bearingsParam(271.6)).toBe('&bearings=272,45;');
    expect(bearingsParam(-90)).toBe('&bearings=270,45;');
    expect(bearingsParam(360)).toBe('&bearings=0,45;');
    expect(bearingsParam(359.6)).toBe('&bearings=0,45;');
    expect(bearingsParam(725)).toBe('&bearings=5,45;');
  });
  it('is empty for anything that is not a usable number (a malformed value is a 400 InvalidValue)', () => {
    expect(bearingsParam(null)).toBe('');
    expect(bearingsParam(undefined)).toBe('');
    expect(bearingsParam(NaN)).toBe('');
    expect(bearingsParam(Infinity)).toBe('');
    expect(buildOsrmUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { bearingDeg: NaN })).not.toContain('bearings');
  });
});
