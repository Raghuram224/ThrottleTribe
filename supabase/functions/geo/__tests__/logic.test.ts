import {
  CAPS,
  firstForwardedFor,
  interpretTake,
  takeFailureResponse,
  geoapifyUrl,
  locationIqScope,
  locationIqUrl,
  mapGeoapifyPlaces,
  parseRequest,
  retryAfterS,
  routeStatus,
  safeRegion,
  usageChecks,
  windowStart,
  type ParsedRequest,
} from '../logic';

describe('parseRequest: input validation', () => {
  it('autocomplete: trims, needs 3 to 100 characters, rounds near to 2 dp', () => {
    expect(parseRequest({ op: 'autocomplete', text: '  mysuru   palace ', near: { lat: 12.34567, lng: 76.65432 } })).toEqual({
      op: 'autocomplete',
      text: 'mysuru palace',
      near: { lat: 12.35, lng: 76.65 },
      limit: 8,
    });
    expect(parseRequest({ op: 'autocomplete', text: 'ab' })).toBeNull();
    expect(parseRequest({ op: 'autocomplete', text: 'x'.repeat(101) })).toBeNull();
    expect(parseRequest({ op: 'autocomplete', text: 42 })).toBeNull();
    expect(parseRequest({ op: 'autocomplete', text: 'abc', near: { lat: 'x', lng: 1 } })).toBeNull();
    expect(parseRequest({ op: 'autocomplete', text: 'abc', near: { lat: 91, lng: 1 } })).toBeNull();
    expect((parseRequest({ op: 'autocomplete', text: 'abc' }) as { near: unknown }).near).toBeNull();
  });
  it('places: only the chip category lists, a 5 or 25 km radius, near required (3 dp)', () => {
    const ok = parseRequest({ op: 'places', categories: 'catering.restaurant,catering.fast_food', near: { lat: 12.97164, lng: 77.59456 }, radiusM: 5000 });
    expect(ok).toEqual({ op: 'places', categories: 'catering.restaurant,catering.fast_food', near: { lat: 12.972, lng: 77.595 }, radiusM: 5000, limit: 20 });
    expect(parseRequest({ op: 'places', categories: 'catering.cafe', near: { lat: 1, lng: 1 }, radiusM: 25000 })).not.toBeNull();
    expect(parseRequest({ op: 'places', categories: 'commercial.supermarket', near: { lat: 1, lng: 1 }, radiusM: 5000 })).toBeNull();
    expect(parseRequest({ op: 'places', categories: 'catering.cafe', near: { lat: 1, lng: 1 }, radiusM: 100000 })).toBeNull();
    expect(parseRequest({ op: 'places', categories: 'catering.cafe', radiusM: 5000 })).toBeNull();
    expect(parseRequest({ op: 'places', categories: 'catering.cafe,,x', near: { lat: 1, lng: 1 }, radiusM: 5000 })).toBeNull();
  });
  it('route: both points, steps boolean, bearing normalised to 0..359', () => {
    const a = { lat: 12.9, lng: 77.5 };
    const b = { lat: 12.3, lng: 76.6 };
    expect(parseRequest({ op: 'route', from: a, to: b, steps: true, bearingDeg: -10.4 })).toEqual({ op: 'route', from: a, to: b, steps: true, alternatives: false, bearingDeg: 350 });
    expect(parseRequest({ op: 'route', from: a, to: b })).toEqual({ op: 'route', from: a, to: b, steps: false, alternatives: false, bearingDeg: null });
    expect(parseRequest({ op: 'route', from: a, to: b, bearingDeg: 360 })).toMatchObject({ bearingDeg: 0 });
    expect(parseRequest({ op: 'route', from: a })).toBeNull();
    expect(parseRequest({ op: 'route', from: a, to: b, steps: 'yes' })).toBeNull();
    expect(parseRequest({ op: 'route', from: a, to: b, bearingDeg: Number.NaN })).toBeNull();
    expect(parseRequest({ op: 'route', from: a, to: { lat: 0, lng: 181 } })).toBeNull();
  });
  it('route: alternatives is an optional boolean (the preview asks for them); anything else is a bad request', () => {
    const a = { lat: 12.9, lng: 77.5 };
    const b = { lat: 12.3, lng: 76.6 };
    expect(parseRequest({ op: 'route', from: a, to: b, steps: true, alternatives: true })).toMatchObject({ alternatives: true });
    expect(parseRequest({ op: 'route', from: a, to: b, alternatives: false })).toMatchObject({ alternatives: false });
    expect(parseRequest({ op: 'route', from: a, to: b })).toMatchObject({ alternatives: false });
    expect(parseRequest({ op: 'route', from: a, to: b, alternatives: 'true' })).toBeNull();
    expect(parseRequest({ op: 'route', from: a, to: b, alternatives: 2 })).toBeNull();
  });
  it('rejects anything else', () => {
    for (const body of [null, 'x', 5, [], {}, { op: 'delete' }, { op: 'geocode' }]) expect(parseRequest(body)).toBeNull();
  });
});

describe('caps (24 §5.2)', () => {
  const caller = { userHash: 'h', ipHash: 'ip', anonymous: false };
  it('app caps sit below the providers free limits (LocationIQ 1/s and 50/min: fixed windows can double up)', () => {
    expect(CAPS.geoapify.day).toBe(2800);
    expect(CAPS.geoapify.second).toBe(4);
    expect(CAPS.locationiq).toEqual({ day: 4800, minute: 50, second: 1 });
    expect(CAPS.user).toEqual({ search: { minute: 30, day: 400 }, route: { minute: 12, day: 200 } });
    expect(CAPS.ip).toEqual({ search: { minute: 60, day: 600 }, route: { minute: 20, day: 300 } });
  });
  it('a search takes from the rider, the address, then second and day; a route likewise with its minute', () => {
    expect(usageChecks('autocomplete', caller).map((c) => [c.bucket, c.limit, c.scope])).toEqual([
      ['u:h:search:min', 30, 'user'],
      ['u:h:search:day', 400, 'user'],
      ['ip:ip:search:min', 60, 'user'],
      ['ip:ip:search:day', 600, 'user'],
      ['geoapify:sec', 4, 'second'],
      ['geoapify:day', 2800, 'day'],
    ]);
    expect(usageChecks('places', caller)).toEqual(usageChecks('autocomplete', caller));
    expect(usageChecks('route', caller).map((c) => [c.bucket, c.limit, c.scope])).toEqual([
      ['u:h:route:min', 12, 'user'],
      ['u:h:route:day', 200, 'user'],
      ['ip:ip:route:min', 20, 'user'],
      ['ip:ip:route:day', 300, 'user'],
      ['liq:sec', 1, 'second'],
      ['liq:min', 50, 'minute'],
      ['liq:day', 4800, 'day'],
    ]);
  });
  it('an anonymous session gets half the per-rider caps; the address caps do not change', () => {
    const anon = usageChecks('route', { ...caller, anonymous: true });
    expect(anon.slice(0, 2).map((c) => c.limit)).toEqual([6, 100]);
    expect(anon[2].limit).toBe(20);
    expect(usageChecks('autocomplete', { ...caller, anonymous: true }).slice(0, 2).map((c) => c.limit)).toEqual([15, 200]);
  });
  it('without an address there are no address buckets, and never more than the 8 the SQL accepts', () => {
    const noIp = usageChecks('route', { ...caller, ipHash: null });
    expect(noIp.some((c) => c.bucket.startsWith('ip:'))).toBe(false);
    expect(usageChecks('route', caller).length).toBeLessThanOrEqual(8);
  });
  it('the first forwarded address is the client', () => {
    expect(firstForwardedFor('203.0.113.9, 10.0.0.1')).toBe('203.0.113.9');
    expect(firstForwardedFor(' 198.51.100.4 ')).toBe('198.51.100.4');
    expect(firstForwardedFor('')).toBeNull();
    expect(firstForwardedFor(null)).toBeNull();
  });
  it('windows start on the second, minute and UTC day; retryAfter counts to the next one', () => {
    const t = Date.UTC(2026, 9, 16, 10, 20, 30, 400);
    expect(windowStart(t, 'second')).toBe('2026-10-16T10:20:30.000Z');
    expect(windowStart(t, 'minute')).toBe('2026-10-16T10:20:00.000Z');
    expect(windowStart(t, 'day')).toBe('2026-10-16T00:00:00.000Z');
    const c = (window: 'second' | 'minute' | 'day') => ({ bucket: 'b', window, limit: 1, scope: 'minute' as const });
    expect(retryAfterS(c('second'), t)).toBe(1);
    expect(retryAfterS(c('minute'), t)).toBe(30); // 29.6 s left, rounded up
    expect(retryAfterS(c('day'), t)).toBe(13 * 3600 + 39 * 60 + 30);
  });
});

describe('upstream requests', () => {
  it('Geoapify autocomplete: text, proximity bias (lon,lat), limit 8, json, key', () => {
    const req = parseRequest({ op: 'autocomplete', text: 'mysuru', near: { lat: 12.97, lng: 77.59 } }) as Extract<ParsedRequest, { op: 'autocomplete' }>;
    const u = new URL(geoapifyUrl(req, 'KEY'));
    expect(u.origin + u.pathname).toBe('https://api.geoapify.com/v1/geocode/autocomplete');
    expect(Object.fromEntries(u.searchParams)).toEqual({ text: 'mysuru', bias: 'proximity:77.59,12.97', limit: '8', lang: 'en', format: 'json', apiKey: 'KEY' });
  });
  it('Geoapify places: circle filter, bias, limit 20', () => {
    const req = parseRequest({ op: 'places', categories: 'parking.cars,parking.motorcycle', near: { lat: 12.971, lng: 77.594 }, radiusM: 25000 }) as Extract<ParsedRequest, { op: 'places' }>;
    const url = geoapifyUrl(req, 'KEY');
    expect(url).toContain('https://api.geoapify.com/v2/places?');
    expect(url).toContain('categories=parking.cars,parking.motorcycle');
    expect(url).toContain('filter=circle:77.594,12.971,25000');
    expect(url).toContain('bias=proximity:77.594,12.971');
    expect(url).toContain('limit=20');
  });
  it('LocationIQ: driving, lng,lat;lng,lat, geojson, full, steps, optional bearings', () => {
    const req = parseRequest({ op: 'route', from: { lat: 12.9, lng: 77.5 }, to: { lat: 12.3, lng: 76.6 }, steps: true, bearingDeg: 90 }) as Extract<ParsedRequest, { op: 'route' }>;
    const url = locationIqUrl(req, 'K', 'us1');
    expect(url.startsWith('https://us1.locationiq.com/v1/directions/driving/77.5,12.9;76.6,12.3?')).toBe(true);
    expect(url).toContain('geometries=geojson');
    expect(url).toContain('overview=full');
    expect(url).toContain('steps=true');
    expect(url.endsWith('&bearings=90,45;')).toBe(true);
    expect(locationIqUrl({ ...req, bearingDeg: null, steps: false }, 'K', 'eu1')).toMatch(/^https:\/\/eu1\..*steps=false$/);
  });
  it('LocationIQ: alternatives=true only when asked, so a plain route URL is unchanged', () => {
    const base = parseRequest({ op: 'route', from: { lat: 12.9, lng: 77.5 }, to: { lat: 12.3, lng: 76.6 }, steps: true }) as Extract<ParsedRequest, { op: 'route' }>;
    expect(locationIqUrl(base, 'K', 'us1')).not.toContain('alternatives');
    const alt = parseRequest({ op: 'route', from: { lat: 12.9, lng: 77.5 }, to: { lat: 12.3, lng: 76.6 }, steps: true, alternatives: true }) as Extract<ParsedRequest, { op: 'route' }>;
    expect(locationIqUrl(alt, 'K', 'us1')).toContain('alternatives=true');
  });
  it('the region can only be a short lowercase label (it ends up in a hostname)', () => {
    expect(safeRegion('eu1')).toBe('eu1');
    expect(safeRegion('us1')).toBe('us1');
    for (const bad of ['evil.com/x', 'US1', '', undefined, null, 'a'.repeat(20)]) expect(safeRegion(bad as string | undefined)).toBe('us1');
  });
});

describe('mapGeoapifyPlaces', () => {
  it('reads Autocomplete (format=json results[])', () => {
    const out = mapGeoapifyPlaces({
      results: [
        { place_id: 'p1', name: 'Mysore Palace', address_line1: 'Mysore Palace', street: 'Sayyaji Rao Rd', city: 'Mysuru', lat: 12.3, lon: 76.65, category: 'tourism.sights' },
        { name: '', address_line1: '', lat: 1, lon: 1 },
        { name: 'No point' },
      ],
    });
    expect(out).toEqual([
      { id: 'p1', name: 'Mysore Palace', label: 'Mysore Palace', street: 'Sayyaji Rao Rd', housenumber: '', city: 'Mysuru', lat: 12.3, lng: 76.65, categories: ['tourism.sights'] },
    ]);
  });
  it('reads Places (GeoJSON features), taking the point from the geometry when properties lack it', () => {
    const out = mapGeoapifyPlaces({
      features: [
        { properties: { place_id: 'a', name: 'HP', lat: 12.9, lon: 77.5, categories: ['service.vehicle.fuel', 'fuel'] }, geometry: { coordinates: [0, 0] } },
        { properties: { place_id: 'b', name: 'Indian Oil', categories: ['service.vehicle.fuel'] }, geometry: { coordinates: [77.6, 12.8] } },
      ],
    });
    expect(out.map((p) => [p.id, p.lat, p.lng])).toEqual([['a', 12.9, 77.5], ['b', 12.8, 77.6]]);
    expect(out[0].categories).toEqual(['service.vehicle.fuel', 'fuel']);
  });
  it('is empty for anything else', () => {
    expect(mapGeoapifyPlaces(null)).toEqual([]);
    expect(mapGeoapifyPlaces({ results: 5 })).toEqual([]);
  });
});

describe('upstream error mapping', () => {
  it('LocationIQ 429 wording picks the scope; unknown reads as minute', () => {
    expect(locationIqScope({ error: 'Rate Limited Second' })).toBe('second');
    expect(locationIqScope({ error: 'Rate Limited Minute' })).toBe('minute');
    expect(locationIqScope({ error: 'Rate Limited Day' })).toBe('day');
    expect(locationIqScope({ error: 'Rate Limited - Daily' })).toBe('day');
    expect(locationIqScope('Rate Limited Second')).toBe('second');
    expect(locationIqScope(null)).toBe('minute');
  });
  it('routeStatus: NoRoute is a normal answer, 429 a limit, other non-2xx an upstream failure', () => {
    expect(routeStatus(200, { code: 'Ok', routes: [] })).toBe('ok');
    expect(routeStatus(200, { code: 'NoRoute' })).toBe('no_route');
    expect(routeStatus(404, { code: 'NoRoute' })).toBe('no_route');
    expect(routeStatus(429, { error: 'Rate Limited Day' })).toBe('rate_limited');
    expect(routeStatus(401, { error: 'Invalid key' })).toBe('upstream');
    expect(routeStatus(500, null)).toBe('upstream');
  });
});

describe('geo_take result handling (the bug where a full bucket read as "charged OK")', () => {
  const checks = usageChecks('route', { userHash: 'h', ipHash: null, anonymous: false });
  const now = Date.UTC(2026, 9, 16, 10, 20, 30);
  it('0 is ok and sends no failure response', () => {
    const t = interpretTake(null, 0, checks, now);
    expect(t).toEqual({ kind: 'ok' });
    expect(takeFailureResponse(t)).toBeNull();
  });
  it('n > 0 names the n-th bucket as full and answers 429 with its scope and retryAfter', () => {
    const t = interpretTake(null, 4, checks, now); // liq:min
    expect(t).toMatchObject({ kind: 'full', check: { bucket: 'liq:min', scope: 'minute' }, retryAfterS: 30 });
    expect(takeFailureResponse(t)).toEqual({ status: 429, body: { error: 'rate_limited', scope: 'minute', retryAfterS: 30 } });
    expect(takeFailureResponse(interpretTake(null, 1, checks, now))?.body.scope).toBe('user');
    expect(takeFailureResponse(interpretTake(null, 5, checks, now))?.body.scope).toBe('day');
  });
  it('an RPC error or an unreadable result is counters_unavailable (503), never ok and never not_configured', () => {
    for (const [err, data] of [[{ message: 'x' }, null], [null, null], [null, 'a'], [null, -1], [null, 1.5], [null, 99]] as const) {
      const r = takeFailureResponse(interpretTake(err, data, checks, now));
      expect(r).toEqual({ status: 503, body: { error: 'counters_unavailable' } });
    }
  });
});
// The SQL itself (full bucket returns its index, earlier buckets roll back) is tested in supabase/tests/geo_usage.test.sql.
