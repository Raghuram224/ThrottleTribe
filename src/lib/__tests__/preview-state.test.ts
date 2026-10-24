import type { NavRoute } from '../nav-route';
import { previewState, routesForTrip, tripKey } from '../preview-state';

const route = (n: number): NavRoute => ({ coords: [], distanceM: n, durationS: n });
const origin = { lat: 12, lng: 77 };
const base = { origin, avoid: true, settled: true, key: 'k1', answer: null, lastRoutes: null };
const ok = (...rs: NavRoute[]) => ({ status: 'ok' as const, route: rs[0], routes: rs });

describe('previewState', () => {
  it('locating without a start point', () => {
    expect(previewState({ ...base, origin: null })).toEqual({ status: 'locating' });
  });
  it('loading until the first answer', () => {
    expect(previewState(base)).toEqual({ status: 'loading' });
  });
  it('shows the answer for the current question, every route of it', () => {
    expect(previewState({ ...base, answer: { key: 'k1', result: ok(route(1)) } })).toEqual({ status: 'ok', route: route(1), routes: [route(1)] });
    expect(previewState({ ...base, answer: { key: 'k1', result: ok(route(1), route(2), route(3)) } })).toEqual({
      status: 'ok',
      route: route(1),
      routes: [route(1), route(2), route(3)],
    });
    expect(previewState({ ...base, answer: { key: 'k1', result: { status: 'no_route' } } })).toEqual({ status: 'no_route' });
    expect(previewState({ ...base, answer: { key: 'k1', result: { status: 'failed' } } })).toEqual({ status: 'failed' });
  });
  it('keeps the previous routes (updating) while a tap is still settling: no request yet, no flash', () => {
    const answer = { key: 'k1', result: ok(route(1)) };
    // Rapid toggles: the switch moved but has not settled, so the old answer is not shown as current.
    expect(previewState({ ...base, avoid: false, settled: true, answer, lastRoutes: [route(1), route(2)] })).toEqual({
      status: 'updating',
      route: route(1),
      routes: [route(1), route(2)],
    });
  });
  it('toggling back before it settles needs nothing: the same answer is current again', () => {
    const answer = { key: 'k1', result: ok(route(1)) };
    expect(previewState({ ...base, avoid: true, settled: true, answer, lastRoutes: [route(1)] })).toEqual({ status: 'ok', route: route(1), routes: [route(1)] });
  });
  it('keeps the previous routes while the new question is in flight, and ignores the older answer', () => {
    const old = { key: 'k1', result: ok(route(1)) };
    const updating = { status: 'updating', route: route(1), routes: [route(1)] };
    expect(previewState({ ...base, key: 'k2', avoid: false, settled: false, answer: old, lastRoutes: [route(1)] })).toEqual(updating);
    expect(previewState({ ...base, key: 'k2', answer: old, lastRoutes: [route(1)] })).toEqual(updating);
  });
  it('never carries a straight line: loading, failed, no route and busy states hold no geometry', () => {
    for (const status of ['no_route', 'failed'] as const) {
      expect(previewState({ ...base, answer: { key: 'k1', result: { status } } })).toEqual({ status });
    }
    expect(previewState(base)).not.toHaveProperty('route');
  });
});

describe('last routes belong to their trip (R5)', () => {
  const A = { lat: 12, lng: 77 };
  const B = { lat: 13, lng: 78 };
  const C = { lat: 14, lng: 79 };
  const last = { pair: tripKey(A, B), routes: [route(1)] };
  it('serves them for the same trip only', () => {
    expect(routesForTrip(last, tripKey(A, B))).toEqual([route(1)]);
    expect(routesForTrip(last, tripKey(A, C))).toBeNull();
    expect(routesForTrip(last, tripKey({ lat: 12.5, lng: 77 }, B))).toBeNull();
    expect(routesForTrip(null, tripKey(A, B))).toBeNull();
    expect(routesForTrip(last, tripKey(null, B))).toBeNull();
  });
  it('another place shows loading, not the old routes, and a rate limit is not "ok" with them', () => {
    const lastRoutes = routesForTrip(last, tripKey(A, C));
    expect(previewState({ ...base, lastRoutes })).toEqual({ status: 'loading' });
    const limited = { key: 'k1', result: { status: 'rate_limited' as const, scope: 'minute' as const, retryAfterS: 5 } };
    expect(previewState({ ...base, answer: limited, lastRoutes })).toEqual({ status: 'rate_limited', retryAfterS: 5 });
  });
});
