import { fetchNavRouteResult, parseOsrmResponse, resetRoutingMemo, routingPausedUntilMs, setRouteRateLimitedListener, GEO_NOT_CONFIGURED_MEMO_MS } from '../nav-route';

// Routes go through the `geo` function (LocationIQ); when it is not configured the OSRM URL answers (dev / transition).
const mockGeoCall = jest.fn();
jest.mock('../geo-api', () => ({
  ...jest.requireActual('../geo-api'),
  geoCall: (...args: unknown[]) => mockGeoCall(...args),
}));
let mockFallbackAllowed = true;
let mockSupportsExclude = false;
jest.mock('../flags', () => ({
  ROUTING_URL: 'https://router.project-osrm.org/route/v1/driving',
  ROUTING_DIRECT: false,
  get ROUTING_FALLBACK_ALLOWED() {
    return mockFallbackAllowed;
  },
  get ROUTING_SUPPORTS_EXCLUDE() {
    return mockSupportsExclude;
  },
}));

const from = { lat: 12.9716, lng: 77.5946 };
const to = { lat: 12.2958, lng: 76.6394 };

// LocationIQ Directions answer, OSRM-shaped (geometries=geojson, steps=true). One step has no maneuver fields at all,
// another no `driving_side`: the parser must cope.
const liqBody = {
  code: 'Ok',
  waypoints: [{ name: '', location: [77.5946, 12.9716] }, { name: '', location: [76.6394, 12.2958] }],
  routes: [
    {
      distance: 3000,
      duration: 240,
      weight: 240,
      weight_name: 'routability',
      geometry: { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.6, 12.98], [77.61, 12.99]] },
      legs: [
        {
          distance: 3000,
          duration: 240,
          summary: 'MG Road',
          steps: [
            { distance: 1000, duration: 80, name: 'MG Road', geometry: { type: 'LineString', coordinates: [] }, maneuver: { location: [77.5946, 12.9716], bearing_before: 0, bearing_after: 45, type: 'depart', modifier: 'right' }, driving_side: 'left' },
            { distance: 1500, duration: 120, name: 'Hosur Rd', ref: 'NH44', maneuver: { location: [77.6, 12.98], type: 'turn', modifier: 'left' } },
            { distance: 500, duration: 40, name: '', maneuver: { location: [77.61, 12.99] } },
            { distance: 0, duration: 0, name: '', maneuver: {} },
            { distance: 0, duration: 0, name: '' },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => {
  mockFallbackAllowed = true;
  mockSupportsExclude = false;
  mockGeoCall.mockReset();
  resetRoutingMemo();
  setRouteRateLimitedListener(null);
  globalThis.fetch = jest.fn() as unknown as typeof fetch;
});

describe('parsing a LocationIQ-shaped answer with the OSRM parser', () => {
  it('reads geometry, distance, duration and the steps that have a location; skips the rest', () => {
    const r = parseOsrmResponse(liqBody);
    expect(r?.distanceM).toBe(3000);
    expect(r?.durationS).toBe(240);
    expect(r?.coords).toHaveLength(3);
    // Steps without a location are dropped; one without type/modifier is 'unknown'; a missing driving_side inherits the last known one (here left).
    expect(r?.steps?.map((s) => s.type)).toEqual(['depart', 'turn', 'unknown']);
    expect(r?.steps?.[2]).toMatchObject({ modifier: null, exit: null, name: '', drivingSide: 'left' });
    expect(r?.steps?.[1]).toMatchObject({ modifier: 'left', ref: 'NH44' });
    expect(r?.steps?.[0].drivingSide).toBe('left');
  });
  it('a route without legs parses without steps', () => {
    const { legs: _legs, ...bare } = liqBody.routes[0];
    void _legs;
    expect(parseOsrmResponse({ routes: [bare] })?.steps).toBeUndefined();
  });
});

describe('fetchNavRouteResult through geo', () => {
  it('a configured function answers: the route comes from it and the OSRM URL is never fetched', async () => {
    mockGeoCall.mockResolvedValue({ ok: true, data: liqBody });
    const r = await fetchNavRouteResult(from, to, { steps: true, bearingDeg: 90.4, noCache: true });
    expect(r.status).toBe('ok');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockGeoCall.mock.calls[0][0]).toEqual({ op: 'route', from, to, steps: true, bearingDeg: 90.4 });
    expect(mockGeoCall.mock.calls[0][1]).toMatchObject({ timeoutMs: 8000 });
  });
  it('NoRoute from LocationIQ is no_route', async () => {
    mockGeoCall.mockResolvedValue({ ok: true, data: { code: 'NoRoute' } });
    expect(await fetchNavRouteResult(from, to, { noCache: true })).toEqual({ status: 'no_route' });
  });
  it('not configured: falls back to the OSRM URL, and does not ask the function again for a while', async () => {
    mockGeoCall.mockResolvedValue({ ok: false, failure: { kind: 'not_configured' } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(liqBody) });
    expect((await fetchNavRouteResult(from, to, { noCache: true })).status).toBe('ok');
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain('router.project-osrm.org');
    expect((await fetchNavRouteResult(from, to, { noCache: true })).status).toBe('ok');
    expect(mockGeoCall).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(GEO_NOT_CONFIGURED_MEMO_MS).toBe(600_000);
  });
  it('configured but failing (5xx, timeout, unreachable) is a failure: no OSRM fallback in production', async () => {
    for (const kind of ['upstream', 'timeout', 'unreachable']) {
      mockGeoCall.mockResolvedValue({ ok: false, failure: { kind } });
      expect(await fetchNavRouteResult(from, to, { noCache: true })).toEqual({ status: 'failed' });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('a minute limit comes back as rate_limited with its retryAfterS, and no fallback request', async () => {
    mockGeoCall.mockResolvedValue({ ok: false, failure: { kind: 'rate_limited', scope: 'minute', retryAfterS: 22 } });
    expect(await fetchNavRouteResult(from, to, { noCache: true })).toEqual({ status: 'rate_limited', scope: 'minute', retryAfterS: 22 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(routingPausedUntilMs(Date.now())).toBeNull();
  });
  it('a day limit pauses routing: later calls answer at once without asking the function', async () => {
    mockGeoCall.mockResolvedValue({ ok: false, failure: { kind: 'rate_limited', scope: 'day', retryAfterS: 40_000 } });
    expect((await fetchNavRouteResult(from, to, { noCache: true })).status).toBe('rate_limited');
    expect(routingPausedUntilMs(Date.now())).not.toBeNull();
    const again = await fetchNavRouteResult(from, to, { noCache: true });
    expect(again).toMatchObject({ status: 'rate_limited', scope: 'day' });
    expect((again as { retryAfterS: number }).retryAfterS).toBeLessThanOrEqual(1800);
    expect(mockGeoCall).toHaveBeenCalledTimes(1);
  });
  it('telemetry for a limit fires once per scope and context per 10 minutes', async () => {
    const seen = jest.fn();
    setRouteRateLimitedListener(seen);
    mockGeoCall.mockResolvedValue({ ok: false, failure: { kind: 'rate_limited', scope: 'minute', retryAfterS: 5 } });
    await fetchNavRouteResult(from, to, { noCache: true, context: 'preview' });
    await fetchNavRouteResult(from, to, { noCache: true, context: 'preview' });
    await fetchNavRouteResult(from, to, { noCache: true, context: 'nav' });
    expect(seen.mock.calls).toEqual([['minute', 'preview'], ['minute', 'nav']]);
  });
  it('in a release build (no demo fallback) not configured is a failed route and the OSRM URL is never fetched', async () => {
    mockFallbackAllowed = false;
    mockGeoCall.mockResolvedValue({ ok: false, failure: { kind: 'not_configured' } });
    expect(await fetchNavRouteResult(from, to, { noCache: true })).toEqual({ status: 'failed' });
    expect(await fetchNavRouteResult(from, to, { noCache: true })).toEqual({ status: 'failed' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockGeoCall).toHaveBeenCalledTimes(1); // remembered for a while
  });
  it('a route says who computed it, so the credit is right', async () => {
    mockGeoCall.mockResolvedValue({ ok: true, data: liqBody });
    const a = await fetchNavRouteResult(from, to, { noCache: true });
    expect(a.status === 'ok' && a.route.provider).toBe('locationiq');
    mockGeoCall.mockResolvedValue({ ok: false, failure: { kind: 'not_configured' } });
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(liqBody) });
    resetRoutingMemo();
    const b = await fetchNavRouteResult(from, to, { noCache: true });
    expect(b.status === 'ok' && b.route.provider).toBe('osrm');
  });
  it('a LocationIQ route never claims it avoided expressways, even with the exclude flag on', async () => {
    mockSupportsExclude = true;
    mockGeoCall.mockResolvedValue({ ok: true, data: liqBody });
    const r = await fetchNavRouteResult(from, to, { avoidMotorways: true, noCache: true });
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.route.avoidedMotorways).toBeUndefined();
  });
});

describe('alternatives through the geo function', () => {
  it('asks `geo` for alternatives only for the preview, and reads every route it returns', async () => {
    const second = { ...liqBody.routes[0], distance: 3600, duration: 200, geometry: { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.62, 12.97], [77.61, 12.99]] } };
    mockGeoCall.mockResolvedValue({ ok: true, data: { ...liqBody, routes: [liqBody.routes[0], second] } });
    const r = await fetchNavRouteResult(from, to, { steps: true, alternatives: true });
    expect(mockGeoCall.mock.calls[0][0]).toMatchObject({ op: 'route', steps: true, alternatives: true });
    expect(r.status === 'ok' && r.routes.map((x) => x.distanceM)).toEqual([3000, 3600]);
    expect(r.status === 'ok' && r.routes.every((x) => x.provider === 'locationiq')).toBe(true);
    mockGeoCall.mockClear();
    await fetchNavRouteResult(to, from, { steps: true });
    expect(mockGeoCall.mock.calls[0][0]).not.toHaveProperty('alternatives');
  });
});
