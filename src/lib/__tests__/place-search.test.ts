import {
  buildPhotonUrl,
  clearPlaceSearchCache,
  createLruCache,
  distinctAddress,
  parsePhotonResponse,
  placeRowA11y,
  PlaceSearchError,
  searchErrorKind,
  searchPlaces,
  sortByDistance,
} from '../place-search';

// The geo function is not configured here: searchPlaces falls back to Photon (fetch is mocked). The chain itself is in
// place-search-chain.test.ts.
jest.mock('../geo-api', () => ({
  ...jest.requireActual('../geo-api'),
  geoCall: jest.fn().mockResolvedValue({ ok: false, failure: { kind: 'not_configured' } }),
}));

const feature = (name: string | undefined, lng: number, lat: number, extra: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { osm_type: 'N', osm_id: Math.round(lng * 1000), name, ...extra },
});
const me = { lat: 12.97, lng: 77.59 };

describe('parsePhotonResponse', () => {
  it('maps fields, category and distance', () => {
    const json = {
      features: [
        feature('Cafe Coffee Day', 77.6, 12.98, { street: 'MG Road', city: 'Bengaluru', osm_key: 'amenity', osm_value: 'cafe' }),
      ],
    };
    const [p] = parsePhotonResponse(json, me);
    expect(p).toMatchObject({
      id: 'p:N77600', source: 'photon', name: 'Cafe Coffee Day', address: 'MG Road, Bengaluru', lat: 12.98, lng: 77.6, category: 'cafe',
    });
    expect(p.distanceM).toBeGreaterThan(1000);
    expect(p.distanceM).toBeLessThan(2000);
  });
  it('maps the other categories and falls back to other', () => {
    const cat = (v: string, k = 'amenity') => parsePhotonResponse({ features: [feature('x', 77, 12, { osm_key: k, osm_value: v })] })[0].category;
    expect(cat('fuel')).toBe('fuel');
    expect(cat('fast_food')).toBe('restaurant');
    expect(cat('parking')).toBe('parking');
    expect(cat('toilets')).toBe('toilets');
    expect(cat('bank')).toBe('other');
    expect(cat('cafe', 'shop')).toBe('other');
  });
  it('uses the street when there is no name, skips junk, null distance without a position', () => {
    const json = {
      features: [
        feature(undefined, 77.1, 12.1, { street: 'NH 275', housenumber: '4' }),
        feature(undefined, 77.2, 12.2),
        { type: 'Feature', geometry: { coordinates: ['a', 'b'] }, properties: { name: 'bad' } },
        feature('Far', 77.3, 95),
      ],
    };
    const out = parsePhotonResponse(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'NH 275 4', address: '', distanceM: null });
  });
  it('returns [] for non-collections', () => {
    expect(parsePhotonResponse(null)).toEqual([]);
    expect(parsePhotonResponse({ message: 'nope' })).toEqual([]);
  });
});

describe('sortByDistance', () => {
  it('orders nearest first, unknown last, stable on ties', () => {
    const mk = (id: string, d: number | null) => ({ id, name: id, address: '', lat: 0, lng: 0, category: 'other' as const, source: 'photon' as const, distanceM: d });
    expect(sortByDistance([mk('a', 500), mk('b', null), mk('c', 100), mk('d', 500)]).map((p) => p.id)).toEqual(['c', 'a', 'd', 'b']);
  });
});

describe('buildPhotonUrl', () => {
  it('sets query, bias, limit, lang and tag', () => {
    const url = buildPhotonUrl({ query: ' cafe ', osmTag: 'amenity:cafe', me });
    expect(url).toBe('https://photon.komoot.io/api/?q=cafe&limit=20&lang=en&lat=12.97&lon=77.59&osm_tag=amenity:cafe');
  });
  it('rounds the bias to 2 decimals (about 1 km) so the exact position is not sent', () => {
    const url = buildPhotonUrl({ query: 'cafe', me: { lat: 12.971599, lng: 77.594566 } });
    expect(url).toContain('&lat=12.97&lon=77.59');
    expect(url).not.toContain('12.9715');
  });
  it('omits bias without a position', () => {
    expect(buildPhotonUrl({ query: 'mysuru' })).toBe('https://photon.komoot.io/api/?q=mysuru&limit=8&lang=en');
  });
});

describe('createLruCache', () => {
  it('evicts the least recently used entry', () => {
    const c = createLruCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1); // a is now newest
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });
});

describe('searchPlaces', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    clearPlaceSearchCache();
    jest.useRealTimers();
  });
  const respond = (json: unknown, ok = true) =>
    jest.fn().mockResolvedValue({ ok, json: () => Promise.resolve(json) });

  it('fetches once for a repeated query (cache) and sorts chips by distance', async () => {
    const fetchMock = respond({
      features: [feature('Far', 77.7, 13.05, { osm_key: 'amenity', osm_value: 'cafe' }), feature('Near', 77.591, 12.971, { osm_key: 'amenity', osm_value: 'cafe' })],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const req = { query: 'cafe', osmTag: 'amenity:cafe', me };
    expect((await searchPlaces(req)).map((p) => p.name)).toEqual(['Near', 'Far']);
    expect((await searchPlaces(req)).map((p) => p.name)).toEqual(['Near', 'Far']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps relevance order for typed queries', async () => {
    globalThis.fetch = respond({ features: [feature('Far', 77.9, 13.5), feature('Near', 77.591, 12.971)] }) as unknown as typeof fetch;
    expect((await searchPlaces({ query: 'abc', me })).map((p) => p.name)).toEqual(['Far', 'Near']);
  });
  it('maps failures to PlaceSearchError', async () => {
    globalThis.fetch = respond({}, false) as unknown as typeof fetch;
    await expect(searchPlaces({ query: 'abc' })).rejects.toMatchObject({ code: 'bad_response' });
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    await expect(searchPlaces({ query: 'abd' })).rejects.toBeInstanceOf(PlaceSearchError);
  });
  it('times out after 6 s', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn((_u: string, init: { signal: AbortSignal }) =>
      new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as unknown as typeof fetch;
    const p = searchPlaces({ query: 'slow' });
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(6001);
    await assertion;
  });
  it('rethrows the abort when the caller cancels', async () => {
    globalThis.fetch = jest.fn((_u: string, init: { signal: AbortSignal }) =>
      new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as unknown as typeof fetch;
    const c = new AbortController();
    const p = searchPlaces({ query: 'cancel me' }, c.signal);
    c.abort();
    await expect(p).rejects.not.toBeInstanceOf(PlaceSearchError);
  });
});

describe('placeRowA11y', () => {
  it('reads name, address and spoken distance', () => {
    expect(placeRowA11y('Mysuru Palace', 'Sayyaji Rao Rd', 118_400)).toBe('Mysuru Palace, Sayyaji Rao Rd, 118 kilometres away');
    expect(placeRowA11y('Cafe', 'MG Road', 350)).toBe('Cafe, MG Road, 350 metres away');
  });
  it('leaves out what is missing', () => {
    expect(placeRowA11y('Cafe', '', 350)).toBe('Cafe, 350 metres away');
    expect(placeRowA11y('Cafe', 'MG Road', null)).toBe('Cafe, MG Road');
    expect(placeRowA11y('Cafe', '', null)).toBe('Cafe');
  });
});

describe('searchErrorKind (a slow provider is not "needs a connection")', () => {
  it('offline is offline whatever the error was', () => {
    expect(searchErrorKind(new PlaceSearchError('network'), true)).toBe('offline');
  });
  it('online: timeout, bad answer and network failure are slow; a 429 is busy', () => {
    for (const code of ['timeout', 'bad_response', 'network'] as const) expect(searchErrorKind(new PlaceSearchError(code), false)).toBe('slow');
    expect(searchErrorKind(new PlaceSearchError('busy'), false)).toBe('busy');
    expect(searchErrorKind(new Error('x'), false)).toBe('slow');
  });
});

describe('distinctAddress (26 H1)', () => {
  it('drops a part that only repeats the name, in any spelling', () => {
    expect(distinctAddress('Kallakuruchi', 'Kallakkurichi')).toBe('');
    expect(distinctAddress('Bengaluru', 'Bengaluru')).toBe('');
    expect(distinctAddress('Hosur', 'Hosur, Krishnagiri')).toBe('Krishnagiri');
    expect(distinctAddress('Mysūru', 'Mysuru')).toBe('');
  });
  it('keeps a real address', () => {
    expect(distinctAddress('Mysuru Palace', 'Sayyaji Rao Rd, Mysuru')).toBe('Sayyaji Rao Rd, Mysuru');
    expect(distinctAddress('HP Petrol Pump', 'Hosur Rd, Bengaluru')).toBe('Hosur Rd, Bengaluru');
  });
  it('short names match exactly only (BP is not HP)', () => {
    expect(distinctAddress('HP', 'BP, Hosur')).toBe('BP, Hosur');
    expect(distinctAddress('HP', 'HP, Hosur')).toBe('Hosur');
  });
  it('the row label never reads the town twice', () => {
    expect(placeRowA11y('Kallakuruchi', 'Kallakkurichi', 202_000)).not.toContain('Kallakkurichi');
  });
});
