import { createOncePerWindow, geoCall, mapGeoResponse, setGeoTransport } from '../geo-api';
import { clampRetryAfterS, nextRouteAt, pauseRemainingS, planRateLimit, ROUTING_DAY_PAUSE_MS } from '../route-limits';

describe('mapGeoResponse (the function contract)', () => {
  it('2xx with a body is the data', () => {
    expect(mapGeoResponse(200, { provider: 'geoapify', places: [] })).toEqual({ ok: true, data: { provider: 'geoapify', places: [] } });
  });
  it('an empty 2xx is an upstream failure', () => {
    expect(mapGeoResponse(200, null)).toEqual({ ok: false, failure: { kind: 'upstream' } });
  });
  it('not deployed (404) and not configured (503) are not_configured', () => {
    expect(mapGeoResponse(404, { code: 'NOT_FOUND' })).toEqual({ ok: false, failure: { kind: 'not_configured' } });
    expect(mapGeoResponse(503, { error: 'not_configured' })).toEqual({ ok: false, failure: { kind: 'not_configured' } });
    expect(mapGeoResponse(503, { error: 'other' })).toEqual({ ok: false, failure: { kind: 'upstream' } });
    // Failing counters are NOT "no key": they must never open the demo fallback or the 30 min Photon stickiness.
    expect(mapGeoResponse(503, { error: 'counters_unavailable' })).toEqual({ ok: false, failure: { kind: 'upstream' } });
  });
  it('429 carries scope and retryAfterS; unknown scope reads as minute, missing retry as 60', () => {
    expect(mapGeoResponse(429, { error: 'rate_limited', scope: 'day', retryAfterS: 5000 })).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', scope: 'day', retryAfterS: 5000 },
    });
    expect(mapGeoResponse(429, { scope: 'weird' })).toEqual({ ok: false, failure: { kind: 'rate_limited', scope: 'minute', retryAfterS: 60 } });
  });
  it('504 and 502 and 400 and 401', () => {
    expect(mapGeoResponse(504, { error: 'timeout' })).toEqual({ ok: false, failure: { kind: 'timeout' } });
    for (const s of [502, 400, 401, 500]) expect(mapGeoResponse(s, { error: 'x' })).toEqual({ ok: false, failure: { kind: 'upstream' } });
  });
  it('no status at all is unreachable', () => {
    expect(mapGeoResponse(null, null)).toEqual({ ok: false, failure: { kind: 'unreachable' } });
  });
});

describe('geoCall', () => {
  afterEach(() => setGeoTransport(null));
  it('maps the transport answer', async () => {
    setGeoTransport(async () => ({ status: 429, body: { scope: 'second', retryAfterS: 1 } }));
    expect(await geoCall({ op: 'autocomplete', text: 'abc' }, { timeoutMs: 1000 })).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', scope: 'second', retryAfterS: 1 },
    });
  });
  it('a transport that throws is unreachable; a cancelled call is aborted', async () => {
    setGeoTransport(async () => {
      throw new Error('boom');
    });
    expect(await geoCall({ op: 'autocomplete', text: 'abc' }, { timeoutMs: 1000 })).toEqual({ ok: false, failure: { kind: 'unreachable' } });
    const ctl = new AbortController();
    ctl.abort();
    expect(await geoCall({ op: 'autocomplete', text: 'abc' }, { timeoutMs: 1000, signal: ctl.signal })).toEqual({ ok: false, failure: { kind: 'aborted' } });
  });
  it('times out', async () => {
    jest.useFakeTimers();
    setGeoTransport((_b, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('abort')))));
    const p = geoCall({ op: 'autocomplete', text: 'abc' }, { timeoutMs: 4000 });
    jest.advanceTimersByTime(4001);
    expect(await p).toEqual({ ok: false, failure: { kind: 'timeout' } });
    jest.useRealTimers();
  });
});

describe('createOncePerWindow (telemetry throttle)', () => {
  it('lets a key through once per window', () => {
    const gate = createOncePerWindow(600_000);
    expect(gate('quota', 0)).toBe(true);
    expect(gate('quota', 599_999)).toBe(false);
    expect(gate('timeout', 1000)).toBe(true);
    expect(gate('quota', 600_000)).toBe(true);
  });
});

describe('route rate-limit plan (24 §3.3)', () => {
  const now = 1_000_000;
  it('second: one automatic retry after 1 s, not a failure; the next one counts', () => {
    expect(planRateLimit('second', 1, now, false)).toEqual({ notBefore: now + 1000, countsAsFailure: false, usedSecondRetry: true, pauseUntil: null });
    expect(planRateLimit('second', 1, now, true)).toMatchObject({ notBefore: now + 1000, countsAsFailure: true, usedSecondRetry: false });
  });
  it('minute and user: wait retryAfterS (at most 60), a failure', () => {
    expect(planRateLimit('minute', 25, now, false)).toMatchObject({ notBefore: now + 25_000, countsAsFailure: true });
    expect(planRateLimit('user', 900, now, false)).toMatchObject({ notBefore: now + 60_000, countsAsFailure: true });
    expect(planRateLimit('minute', 0, now, false).notBefore).toBe(now + 60_000);
  });
  it('day: pauses up to 30 minutes, then one probe', () => {
    const p = planRateLimit('day', 40_000, now, false);
    expect(p).toMatchObject({ notBefore: now + ROUTING_DAY_PAUSE_MS, pauseUntil: now + ROUTING_DAY_PAUSE_MS, countsAsFailure: true });
    expect(planRateLimit('day', 120, now, false).pauseUntil).toBe(now + 120_000);
  });
  it('retryAfter is clamped to 1..60 s', () => {
    expect(clampRetryAfterS(0.2)).toBe(1);
    expect(clampRetryAfterS(30)).toBe(30);
    expect(clampRetryAfterS(Number.NaN)).toBe(60);
    expect(clampRetryAfterS(1e6)).toBe(60);
  });
  it('the next route is at lastFetchAt + max(backoff, retryAfter)', () => {
    expect(nextRouteAt(1000, 10_000, 0)).toBe(11_000); // backoff wins
    expect(nextRouteAt(1000, 10_000, 31_000)).toBe(31_000); // retryAfter wins
  });
  it('pauseRemainingS counts down and ends', () => {
    expect(pauseRemainingS(null, 5)).toBe(0);
    expect(pauseRemainingS(10_500, 10_000)).toBe(1);
    expect(pauseRemainingS(10_000, 10_000)).toBe(0);
  });
});
