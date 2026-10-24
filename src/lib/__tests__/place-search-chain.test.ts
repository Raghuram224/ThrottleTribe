import type { GeoFailure, GeoOutcome, GeoRequest } from '../geo-api';
import {
  fallbackReasonOf,
  geoapifyCategoryOf,
  needsWiden,
  parseGeoapifyPlaces,
  PlaceSearchError,
  canLocateAlone,
  rankChipPlaces,
  searchGate,
  searchPosition,
  runSearch,
  SEARCH_CHIPS,
  shouldTryGeoapify,
  STICKY_QUOTA_MS,
  STICKY_UNREACHABLE_MS,
  stickyMsFor,
  type Place,
  type ProviderState,
  type SearchDeps,
  type SearchRequest,
} from '../place-search';

const me = { lat: 12.9716, lng: 77.5946 };
const dto = (id: string, name: string, lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  label: name,
  street: '',
  housenumber: '',
  city: '',
  lat,
  lng,
  categories: [],
  ...extra,
});
const ok = (places: unknown[]): GeoOutcome => ({ ok: true, data: { provider: 'geoapify', places } });
const fail = (failure: GeoFailure): GeoOutcome => ({ ok: false, failure });
// ~0.009 deg of latitude is 1 km.
const near = (km: number) => me.lat + km * 0.009;

const photonPlace = (id: string, km: number): Place => ({
  id: `p:${id}`,
  name: id,
  address: '',
  lat: near(km),
  lng: me.lng,
  category: 'fuel',
  source: 'photon',
  distanceM: km * 1000,
});

function deps(over: Partial<SearchDeps> & { geoReplies?: GeoOutcome[] } = {}) {
  const geoCalls: GeoRequest[] = [];
  const replies = [...(over.geoReplies ?? [])];
  const report = { fallback: jest.fn(), failed: jest.fn(), chipWidened: jest.fn() };
  let t = 1_000_000;
  const d: SearchDeps = {
    geo: async (req) => {
      geoCalls.push(req);
      return replies.shift() ?? fail({ kind: 'unreachable' });
    },
    photon: jest.fn(async () => [photonPlace('a', 1)]),
    now: () => t,
    report,
    fallbackGate: () => true,
    ...over,
  };
  return { d, geoCalls, report, advance: (ms: number) => (t += ms) };
}
const fresh = (): ProviderState => ({ stickyUntil: 0 });
const typed: SearchRequest = { query: 'mysuru palace', me };
const fuel = SEARCH_CHIPS.find((c) => c.key === 'fuel') as (typeof SEARCH_CHIPS)[number];
const chip: SearchRequest = { query: fuel.query, osmTag: fuel.osmTag, categories: fuel.categories, me };

describe('Geoapify parsing and category mapping (24 §2.4)', () => {
  it('maps a DTO to a Place: g: id, name, "street housenumber, city", category, exact distance', () => {
    const out = parseGeoapifyPlaces(
      { provider: 'geoapify', places: [dto('abc', 'HP Petrol Pump', near(1.2), me.lng, { street: 'Hosur Rd', housenumber: '12', city: 'Bengaluru', categories: ['service.vehicle.fuel'] })] },
      me,
    ) as Place[];
    expect(out[0]).toMatchObject({ id: 'g:abc', name: 'HP Petrol Pump', address: 'Hosur Rd 12, Bengaluru', category: 'fuel', source: 'geoapify' });
    expect(out[0].distanceM).toBeGreaterThan(1100);
    expect(out[0].distanceM).toBeLessThan(1300);
  });
  it('falls back to the address line, then the street, for a place without a name; chips drop it', () => {
    const rows = [dto('1', '', 12, 77, { label: 'Some Street 4' }), dto('2', '', 12, 77, { label: '', street: 'NH 275' })];
    const typedOut = parseGeoapifyPlaces({ places: rows }, null) as Place[];
    expect(typedOut.map((p) => p.name)).toEqual(['Some Street 4', 'NH 275']);
    expect(parseGeoapifyPlaces({ places: rows }, null, { requireName: true })).toEqual([]);
  });
  it('is null for the wrong shape, and skips rows without a usable point', () => {
    expect(parseGeoapifyPlaces(null)).toBeNull();
    expect(parseGeoapifyPlaces({ nope: 1 })).toBeNull();
    expect(parseGeoapifyPlaces({ places: [dto('x', 'A', 99, 77), dto('y', 'B', 12, 77), { name: 'C' }] })?.map((p) => p.name)).toEqual(['B']);
  });
  it('maps Geoapify categories to ours; unknown is other', () => {
    expect(geoapifyCategoryOf(['catering.cafe.coffee_shop'])).toBe('cafe');
    expect(geoapifyCategoryOf(['service.vehicle.fuel'])).toBe('fuel');
    expect(geoapifyCategoryOf(['commercial.gas'])).toBe('fuel');
    expect(geoapifyCategoryOf(['catering.restaurant.indian'])).toBe('restaurant');
    expect(geoapifyCategoryOf(['catering.fast_food'])).toBe('restaurant');
    expect(geoapifyCategoryOf(['catering.food_court'])).toBe('restaurant');
    expect(geoapifyCategoryOf(['parking.motorcycle'])).toBe('parking');
    expect(geoapifyCategoryOf(['amenity.toilet'])).toBe('toilets');
    expect(geoapifyCategoryOf(['commercial.supermarket'])).toBe('other');
    expect(geoapifyCategoryOf([])).toBe('other');
  });
  it('chips carry the spec categories', () => {
    expect(SEARCH_CHIPS.map((c) => c.categories)).toEqual([
      'catering.cafe',
      'service.vehicle.fuel',
      'catering.restaurant,catering.fast_food',
      'parking.cars,parking.motorcycle',
      'amenity.toilet',
    ]);
  });
});

describe('chip ranking and widening (24 §2.3, S5)', () => {
  it('shows the nearest 10 by true distance', () => {
    const many = Array.from({ length: 14 }, (_, i) => photonPlace(`p${i}`, 14 - i));
    const out = rankChipPlaces(many);
    expect(out).toHaveLength(10);
    expect(out[0].distanceM).toBe(1000);
    expect(out.map((p) => p.distanceM)).toEqual([...out.map((p) => p.distanceM)].sort((a, b) => (a as number) - (b as number)));
  });
  it('drops anything beyond the cap when one is given (Photon: 25 km)', () => {
    expect(rankChipPlaces([photonPlace('a', 10), photonPlace('b', 30)], 25_000).map((p) => p.name)).toEqual(['a']);
  });
  it('with a cap, a row with no distance is dropped too', () => {
    expect(rankChipPlaces([{ ...photonPlace('a', 1), distanceM: null }, photonPlace('b', 2)], 25_000).map((p) => p.name)).toEqual(['b']);
  });
  it('widens when fewer than 3 named places', () => {
    expect(needsWiden(0)).toBe(true);
    expect(needsWiden(2)).toBe(true);
    expect(needsWiden(3)).toBe(false);
  });
});

describe('fallback decisions and stickiness (24 §2.1, S7)', () => {
  it('names the reason for telemetry', () => {
    expect(fallbackReasonOf({ kind: 'rate_limited', scope: 'second', retryAfterS: 1 })).toBe('rate_limited');
    expect(fallbackReasonOf({ kind: 'rate_limited', scope: 'user', retryAfterS: 9 })).toBe('rate_limited');
    expect(fallbackReasonOf({ kind: 'rate_limited', scope: 'day', retryAfterS: 9 })).toBe('quota');
    expect(fallbackReasonOf({ kind: 'timeout' })).toBe('timeout');
    expect(fallbackReasonOf({ kind: 'unreachable' })).toBe('unreachable');
    expect(fallbackReasonOf({ kind: 'upstream' })).toBe('error');
    expect(fallbackReasonOf({ kind: 'not_configured' })).toBe('error');
    expect(fallbackReasonOf({ kind: 'aborted' })).toBeNull();
  });
  it('only a day quota (and "not configured") makes Photon sticky, for 30 minutes', () => {
    expect(stickyMsFor({ kind: 'rate_limited', scope: 'day', retryAfterS: 1 })).toBe(STICKY_QUOTA_MS);
    expect(stickyMsFor({ kind: 'not_configured' })).toBe(STICKY_QUOTA_MS);
    expect(stickyMsFor({ kind: 'rate_limited', scope: 'second', retryAfterS: 1 })).toBe(0);
    expect(stickyMsFor({ kind: 'timeout' })).toBe(0);
    expect(stickyMsFor({ kind: 'upstream' })).toBe(0);
  });
  it('a per-rider or per-minute limit keeps Photon for retryAfterS, at least 60 s, at most 30 min', () => {
    expect(stickyMsFor({ kind: 'rate_limited', scope: 'user', retryAfterS: 5 })).toBe(60_000);
    expect(stickyMsFor({ kind: 'rate_limited', scope: 'minute', retryAfterS: 90 })).toBe(90_000);
    expect(stickyMsFor({ kind: 'rate_limited', scope: 'user', retryAfterS: 80_000 })).toBe(STICKY_QUOTA_MS);
  });
  it('probes the function again once the sticky period is over', () => {
    expect(shouldTryGeoapify({ stickyUntil: 100 }, 99)).toBe(false);
    expect(shouldTryGeoapify({ stickyUntil: 100 }, 100)).toBe(true);
  });
});

describe('runSearch: the provider chain', () => {
  it('typed: Geoapify answers, Photon is never called, near is rounded to 2 dp', async () => {
    const { d, geoCalls } = deps({ geoReplies: [ok([dto('1', 'Mysuru Palace', 12.3, 76.65)])] });
    const out = await runSearch(typed, undefined, d, fresh());
    expect(out).toMatchObject({ provider: 'geoapify', radiusM: null });
    expect(out.places[0].name).toBe('Mysuru Palace');
    expect(d.photon).not.toHaveBeenCalled();
    expect(geoCalls).toEqual([{ op: 'autocomplete', text: 'mysuru palace', near: { lat: 12.97, lng: 77.59 } }]);
  });
  it('typed: any Geoapify failure falls back to Photon for that request', async () => {
    for (const failure of [
      { kind: 'rate_limited', scope: 'minute', retryAfterS: 5 },
      { kind: 'timeout' },
      { kind: 'upstream' },
      { kind: 'unreachable' },
      { kind: 'not_configured' },
    ] as GeoFailure[]) {
      const { d, report } = deps({ geoReplies: [fail(failure)] });
      const out = await runSearch(typed, undefined, d, fresh());
      expect(out.provider).toBe('photon');
      expect(report.fallback).toHaveBeenCalledTimes(1);
    }
  });
  it('a malformed Geoapify answer is an upstream failure (Photon answers)', async () => {
    const { d } = deps({ geoReplies: [{ ok: true, data: { nope: true } }] });
    expect((await runSearch(typed, undefined, d, fresh())).provider).toBe('photon');
  });
  it('a quota failure makes Photon sticky: the next search does not ask the function, then one probe', async () => {
    const state = fresh();
    const { d, geoCalls, advance } = deps({ geoReplies: [fail({ kind: 'rate_limited', scope: 'day', retryAfterS: 9000 })] });
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(1);
    await runSearch(typed, undefined, d, state);
    await runSearch(chip, undefined, d, state);
    expect(geoCalls).toHaveLength(1); // no request per keystroke
    advance(STICKY_QUOTA_MS + 1);
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(2); // the probe
  });
  it('a per-rider limit is Photon-only for a minute: no function call per keystroke', async () => {
    const state = fresh();
    const { d, geoCalls, advance } = deps({ geoReplies: [fail({ kind: 'rate_limited', scope: 'user', retryAfterS: 20 })] });
    await runSearch(typed, undefined, d, state);
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(1);
    advance(61_000);
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(2);
  });
  it('a one-off 429 is not sticky', async () => {
    const state = fresh();
    const { d, geoCalls } = deps({ geoReplies: [fail({ kind: 'rate_limited', scope: 'second', retryAfterS: 1 })] });
    await runSearch(typed, undefined, d, state);
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(2);
  });
  it('unreachable function while Photon answers: sticky for 5 minutes', async () => {
    const state = fresh();
    const { d, geoCalls, advance } = deps({ geoReplies: [fail({ kind: 'unreachable' })] });
    await runSearch(typed, undefined, d, state);
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(1);
    advance(STICKY_UNREACHABLE_MS + 1);
    await runSearch(typed, undefined, d, state);
    expect(geoCalls).toHaveLength(2);
  });
  it('both providers failing: busy when one said 429 / quota, else the plain error', async () => {
    const photonFails = jest.fn(async () => {
      throw new PlaceSearchError('network');
    });
    const a = deps({ geoReplies: [fail({ kind: 'rate_limited', scope: 'minute', retryAfterS: 5 })], photon: photonFails });
    await expect(runSearch(typed, undefined, a.d, fresh())).rejects.toMatchObject({ code: 'busy' });
    expect(a.report.failed).toHaveBeenCalledWith('busy', 'typed');
    const b = deps({ geoReplies: [fail({ kind: 'timeout' })], photon: photonFails });
    await expect(runSearch(typed, undefined, b.d, fresh())).rejects.toMatchObject({ code: 'network' });
    expect(b.report.failed).toHaveBeenCalledWith('network', 'typed');
    const c = deps({
      geoReplies: [fail({ kind: 'upstream' })],
      photon: jest.fn(async () => {
        throw new PlaceSearchError('busy');
      }),
    });
    await expect(runSearch(typed, undefined, c.d, fresh())).rejects.toMatchObject({ code: 'busy' });
  });
  it('a cancelled search throws an AbortError and does not fall back', async () => {
    const ctl = new AbortController();
    const { d } = deps({
      geo: async () => {
        ctl.abort();
        return fail({ kind: 'aborted' });
      },
    });
    await expect(runSearch(typed, ctl.signal, d, fresh())).rejects.toMatchObject({ name: 'AbortError' });
    expect(d.photon).not.toHaveBeenCalled();
  });
  it('fallback telemetry goes through the gate (once per reason per 10 minutes)', async () => {
    const { d, report } = deps({ geoReplies: [fail({ kind: 'timeout' })], fallbackGate: () => false });
    await runSearch(typed, undefined, d, fresh());
    expect(report.fallback).not.toHaveBeenCalled();
  });
});

describe('runSearch: chips', () => {
  const five = (n: number) => Array.from({ length: n }, (_, i) => dto(`f${i}`, `Pump ${i}`, near(1 + i), me.lng, { categories: ['service.vehicle.fuel'] }));
  it('5 km first; 3 or more named places is enough: one request, nearest first, radius 5 km', async () => {
    const { d, geoCalls } = deps({ geoReplies: [ok(five(5).reverse())] });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(geoCalls).toHaveLength(1);
    expect(geoCalls[0]).toEqual({
      op: 'places',
      categories: 'service.vehicle.fuel',
      near: { lat: 12.972, lng: 77.595 }, // 3 dp
      radiusM: 5000,
    });
    expect(out.radiusM).toBe(5000);
    expect(out.places[0].name).toBe('Pump 0');
  });
  it('fewer than 3 named: widens once to 25 km, the second set replaces the first, never a third request', async () => {
    const { d, geoCalls, report } = deps({ geoReplies: [ok(five(2)), ok(five(6)), ok(five(9))] });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(geoCalls.map((c) => (c as { radiusM: number }).radiusM)).toEqual([5000, 25000]);
    expect(out.radiusM).toBe(25000);
    expect(out.places).toHaveLength(6);
    expect(report.chipWidened).toHaveBeenCalledWith(true);
  });
  it('unnamed places do not count toward the 3', async () => {
    const rows = [dto('a', 'A', near(1), me.lng), dto('b', '', near(2), me.lng, { label: 'Road 5' }), dto('c', '', near(3), me.lng, { label: 'Road 6' })];
    const { d, geoCalls } = deps({ geoReplies: [ok(rows), ok(five(4))] });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(geoCalls).toHaveLength(2);
    expect(out.places).toHaveLength(4);
  });
  it('a widen that fails keeps the first set', async () => {
    const { d } = deps({ geoReplies: [ok(five(2)), fail({ kind: 'timeout' })] });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(out).toMatchObject({ provider: 'geoapify', radiusM: 5000 });
    expect(out.places).toHaveLength(2);
  });
  it('empty even after widening: zero rows, caption radius 25 km', async () => {
    const { d, report } = deps({ geoReplies: [ok([]), ok([])] });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(out).toMatchObject({ places: [], radiusM: 25000 });
    expect(report.chipWidened).toHaveBeenCalledWith(false);
  });
  it('the Photon fallback is sorted by distance and drops anything beyond 25 km', async () => {
    const { d } = deps({
      geoReplies: [fail({ kind: 'upstream' })],
      photon: async () => [photonPlace('far', 40), photonPlace('b', 9), photonPlace('a', 2)],
    });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(out.provider).toBe('photon');
    expect(out.places.map((p) => p.name)).toEqual(['a', 'b']);
    expect(out.radiusM).toBe(25000);
  });
  it('without a position a chip goes straight to Photon and reports no fallback', async () => {
    const { d, geoCalls, report } = deps();
    const out = await runSearch({ ...chip, me: null }, undefined, d, fresh());
    expect(geoCalls).toHaveLength(0);
    expect(out.provider).toBe('photon');
    expect(out.radiusM).toBeNull(); // no filter could run, so no "within 25 km" caption
    expect(report.fallback).not.toHaveBeenCalled();
  });
  it('Photon chip rows are filtered to 25 km: far rows and rows with no distance go, and the caption is true', async () => {
    const worldwide = [photonPlace('near', 3), photonPlace('croatia', 7000), { ...photonPlace('unknown', 1), distanceM: null }];
    const { d } = deps({ photon: jest.fn(async () => worldwide) });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(out.places.map((p) => p.name)).toEqual(['near']);
    expect(out.radiusM).toBe(25000);
  });
  it('a chip with a position that finds nothing near says so with the radius it really applied', async () => {
    const { d } = deps({ photon: jest.fn(async () => [photonPlace('croatia', 7000)]) });
    const out = await runSearch(chip, undefined, d, fresh());
    expect(out.places).toEqual([]);
    expect(out.radiusM).toBe(25000);
  });
});

describe('search gate and start position', () => {
  it('a chip never runs without a position: it waits for the fix, or for the rider to allow location', () => {
    expect(searchGate({ chip: true, hasMe: false, canLocate: true })).toBe('locating');
    expect(searchGate({ chip: true, hasMe: false, canLocate: false })).toBe('needsLocation');
    expect(searchGate({ chip: true, hasMe: true, canLocate: false })).toBe('run');
  });
  it('typed search may run without a position', () => {
    expect(searchGate({ chip: false, hasMe: false, canLocate: false })).toBe('run');
  });
  it('location can arrive by itself only with permission and the phone switch on', () => {
    expect(canLocateAlone('granted', true)).toBe(true);
    expect(canLocateAlone('unknown', null)).toBe(true);
    expect(canLocateAlone('granted', false)).toBe(false);
    expect(canLocateAlone('denied', true)).toBe(false);
    expect(canLocateAlone('undetermined', true)).toBe(false);
  });
  it("starts from this screen's own fix, else Home's seed", () => {
    expect(searchPosition({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).toEqual({ lat: 1, lng: 2 });
    expect(searchPosition(null, { lat: 3, lng: 4 })).toEqual({ lat: 3, lng: 4 });
    expect(searchPosition(null, null)).toBeNull();
  });
});
