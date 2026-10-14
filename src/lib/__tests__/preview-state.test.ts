import type { NavRoute } from '../nav-route';
import { previewState } from '../preview-state';

const route = (n: number): NavRoute => ({ coords: [], distanceM: n, durationS: n });
const origin = { lat: 12, lng: 77 };
const base = { origin, avoid: true, settled: true, key: 'k1', answer: null, lastRoute: null };

describe('previewState', () => {
  it('locating without a start point', () => {
    expect(previewState({ ...base, origin: null })).toEqual({ status: 'locating' });
  });
  it('loading until the first answer', () => {
    expect(previewState(base)).toEqual({ status: 'loading' });
  });
  it('shows the answer for the current question', () => {
    expect(previewState({ ...base, answer: { key: 'k1', result: { status: 'ok', route: route(1) } } })).toEqual({ status: 'ok', route: route(1) });
    expect(previewState({ ...base, answer: { key: 'k1', result: { status: 'no_route' } } })).toEqual({ status: 'no_route' });
    expect(previewState({ ...base, answer: { key: 'k1', result: { status: 'failed' } } })).toEqual({ status: 'failed' });
  });
  it('keeps the previous route (updating) while a tap is still settling: no request yet, no flash', () => {
    const answer = { key: 'k1', result: { status: 'ok' as const, route: route(1) } };
    // Rapid toggles: the switch moved but has not settled, so the old answer is not shown as current.
    expect(previewState({ ...base, avoid: false, settled: true, answer, lastRoute: route(1) })).toEqual({ status: 'updating', route: route(1) });
  });
  it('toggling back before it settles needs nothing: the same answer is current again', () => {
    const answer = { key: 'k1', result: { status: 'ok' as const, route: route(1) } };
    expect(previewState({ ...base, avoid: true, settled: true, answer, lastRoute: route(1) })).toEqual({ status: 'ok', route: route(1) });
  });
  it('keeps the previous route while the new question is in flight, and ignores the older answer', () => {
    const old = { key: 'k1', result: { status: 'ok' as const, route: route(1) } };
    expect(previewState({ ...base, key: 'k2', avoid: false, settled: false, answer: old, lastRoute: route(1) })).toEqual({ status: 'updating', route: route(1) });
    expect(previewState({ ...base, key: 'k2', answer: old, lastRoute: route(1) })).toEqual({ status: 'updating', route: route(1) });
  });
});
