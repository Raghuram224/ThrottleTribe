import { copy } from '../copy';
import {
  attributionClear,
  CREDIT_ENTRIES,
  CREDIT_URLS,
  creditEntries,
  meSlotMinMapH,
  pillHeight,
  pillLine2Key,
  pillFontScale,
  pillLineCount,
  pillLines,
  pillMaxWidth,
  routeCreditLink,
  searchCreditLinks,
} from '../credits';
import { mapControlVisibility } from '../live-chrome';
import { attributionClear as fromPlanFlow } from '../plan-flow';
import { previewState } from '../preview-state';
import { addRecent, parseRecents } from '../recent-places';

describe('credit pill (24 §4.2)', () => {
  it('names LocationIQ only when a road route is drawn on a live map', () => {
    expect(pillLine2Key({ kind: 'live', roadRoute: true, provider: 'locationiq' })).toBe('map.creditRoute');
    expect(pillLine2Key({ kind: 'live', roadRoute: false })).toBeNull();
  });
  it('the route credit follows whoever computed the route; an unknown provider claims nothing', () => {
    expect(pillLine2Key({ kind: 'live', roadRoute: true, provider: 'osrm' })).toBe('map.creditRouteOsrm');
    expect(pillLine2Key({ kind: 'live', roadRoute: true, provider: 'locationiq' })).toBe('map.creditRoute');
    expect(pillLine2Key({ kind: 'live', roadRoute: true })).toBeNull();
    expect(pillLine2Key({ kind: 'live', roadRoute: false, provider: 'locationiq' })).toBeNull();
    expect(routeCreditLink('locationiq')).toMatchObject({ labelKey: 'route.credit', url: CREDIT_URLS.liq });
    expect(routeCreditLink('osrm')).toMatchObject({ labelKey: 'route.creditOsrm', url: CREDIT_URLS.osrm });
    expect(routeCreditLink(undefined)).toBeNull();
  });
  it('place mode names the search provider; browse and the rest show one line', () => {
    expect(pillLine2Key({ kind: 'place', source: 'geoapify' })).toBe('map.creditPlaceGeoapify');
    expect(pillLine2Key({ kind: 'place', source: 'photon' })).toBe('map.creditPlacePhoton');
    expect(pillLine2Key({ kind: 'plain' })).toBeNull();
  });
  it('the licence line is both required credits; line 2 text is the spec wording', () => {
    expect(copy['live.attribution']).toBe('© OpenMapTiles © OpenStreetMap');
    expect(copy['map.creditRoute']).toBe('Routes by LocationIQ.com');
    expect(copy['credits.liq']).toBe('Search by LocationIQ.com');
  });
  it('the pill is 24 / 40 / 56 tall; clearance is 40 / 56 / 72; the me slot needs 104 / 124 / 144 (25 §5.1)', () => {
    expect([1, 2, 3].map((n) => pillHeight(n as 1 | 2 | 3))).toEqual([24, 40, 56]);
    expect(attributionClear(1)).toBe(40);
    expect(attributionClear(2)).toBe(56);
    expect(attributionClear(3)).toBe(72);
    expect(fromPlanFlow(2)).toBe(56);
    expect(meSlotMinMapH(1)).toBe(104);
    expect(meSlotMinMapH(2)).toBe(124);
    expect(meSlotMinMapH(3)).toBe(144);
  });
  it('the me slot hides sooner with more pill lines', () => {
    const args = { controlsHidden: false, positionedRiders: 1 };
    expect(mapControlVisibility({ ...args, mapVisH: 110 }).meSlot).toBe(true);
    expect(mapControlVisibility({ ...args, mapVisH: 110, creditLines: 2 }).meSlot).toBe(false);
    expect(mapControlVisibility({ ...args, mapVisH: 124, creditLines: 2 }).meSlot).toBe(true);
    expect(mapControlVisibility({ ...args, mapVisH: 143, creditLines: 3 }).meSlot).toBe(false);
    expect(mapControlVisibility({ ...args, mapVisH: 144, creditLines: 3 }).meSlot).toBe(true);
  });
  it('max width: the map less 24, less the right column (56 + 12) when it shows', () => {
    expect(pillMaxWidth(360, true)).toBe(268);
    expect(pillMaxWidth(360, false)).toBe(336);
  });
});

describe('the pill grows with the system font, up to 1.3x', () => {
  it('scale 1 is the spec sizes; larger scales add height per line', () => {
    expect([pillHeight(1, 1), pillHeight(2, 1), pillHeight(3, 1)]).toEqual([24, 40, 56]);
    expect(pillHeight(3, 1.3)).toBe(71);
    expect(attributionClear(3, 1.3)).toBe(87);
    expect(attributionClear(1, 1.3)).toBe(8 + Math.ceil(8 + 16 * 1.3) + 8);
  });
  it('is capped at 1.3 (the Text cap) and never below 1', () => {
    expect(pillFontScale(2)).toBe(1.3);
    expect(pillFontScale(0.8)).toBe(1);
    expect(pillFontScale(NaN)).toBe(1);
    expect(pillHeight(3, 2)).toBe(pillHeight(3, 1.3));
  });
  it('the me slot needs more map height with a bigger font', () => {
    expect(meSlotMinMapH(3, 1.3)).toBe(144 + (71 - 56));
    expect(meSlotMinMapH(2, 1)).toBe(124);
  });
});

describe('pill lines with Terrain (25 §5.1)', () => {
  const road = { kind: 'live', roadRoute: true, provider: 'locationiq' } as const;
  it('Standard is the licence line, plus the service line where there is one', () => {
    expect(pillLines({ kind: 'plain' }, false)).toEqual(['live.attribution']);
    expect(pillLines(road, false)).toEqual(['live.attribution', 'map.creditRoute']);
  });
  it('Terrain adds its credit as the last line: Home 2, live with a road route 3', () => {
    expect(pillLines({ kind: 'plain' }, true)).toEqual(['live.attribution', 'map.creditTerrain']);
    expect(pillLines(road, true)).toEqual(['live.attribution', 'map.creditRoute', 'map.creditTerrain']);
    expect(pillLines({ kind: 'place', source: 'photon' }, true)).toHaveLength(3);
    expect(pillLineCount(pillLines(road, true))).toBe(3);
    expect(pillLineCount(pillLines({ kind: 'plain' }, false))).toBe(1);
  });
  it('the AWS fallback names Mapzen and USGS instead', () => {
    expect(pillLines({ kind: 'plain' }, true, 'aws')).toEqual(['live.attribution', 'map.creditTerrainAws']);
    expect(copy['map.creditTerrain']).toBe('Terrain © Mapterhorn');
    expect(copy['map.creditTerrainAws']).toBe('Terrain: Mapzen, USGS');
  });
});

describe('credit links', () => {
  it('the Credits sheet has seven rows: the six, then the elevation provider (25 §5.2)', () => {
    expect(creditEntries('mapterhorn')).toHaveLength(7);
    expect(creditEntries('mapterhorn')[6]).toMatchObject({ titleKey: 'credits.dem', url: 'https://mapterhorn.com/attribution' });
    expect(creditEntries('aws')[6]).toMatchObject({ titleKey: 'credits.demAws', url: CREDIT_URLS.demAws });
    expect(creditEntries('aws').slice(0, 6)).toEqual(CREDIT_ENTRIES);
    for (const c of creditEntries('mapterhorn').concat(creditEntries('aws'))) {
      expect(copy[c.titleKey]).toBeTruthy();
      expect(copy[c.subKey]).toBeTruthy();
    }
  });
  it('the six fixed rows have their sites', () => {
    expect(CREDIT_ENTRIES.map((c) => c.url)).toEqual([
      'https://www.openstreetmap.org/copyright',
      'https://openmaptiles.org/',
      'https://openfreemap.org/',
      'https://www.geoapify.com/',
      'https://locationiq.com/',
      'https://photon.komoot.io/',
    ]);
    for (const c of CREDIT_ENTRIES) {
      expect(copy[c.titleKey]).toBeTruthy();
      expect(copy[c.subKey]).toBeTruthy();
    }
  });
  it('the search credit row names the provider that answered, then OpenStreetMap', () => {
    expect(searchCreditLinks('geoapify').map((l) => [l.labelKey, l.url])).toEqual([
      ['search.creditGeoapify', CREDIT_URLS.geoapify],
      ['credit.osm', CREDIT_URLS.osm],
    ]);
    // Nobody has answered yet: OpenStreetMap alone.
    expect(searchCreditLinks(null).map((l) => l.labelKey)).toEqual(['credit.osm']);
    expect(searchCreditLinks('photon')[0]).toMatchObject({ labelKey: 'search.creditPhoton', url: CREDIT_URLS.photon });
  });
});

describe('preview state under a rate limit (24 §3.4)', () => {
  const origin = { lat: 12, lng: 77 };
  const base = { origin, avoid: false, settled: false, key: 'k', lastRoutes: null };
  const limited = { key: 'k', result: { status: 'rate_limited' as const, scope: 'minute' as const, retryAfterS: 30 } };
  it('no route yet: the busy state (note, Try again, no line; Start stays enabled)', () => {
    expect(previewState({ ...base, answer: limited })).toEqual({ status: 'rate_limited', retryAfterS: 30 });
  });
  it('a route already drawn is kept', () => {
    const r = { coords: [], distanceM: 1, durationS: 1 };
    expect(previewState({ ...base, answer: limited, lastRoutes: [r] })).toEqual({ status: 'ok', route: r, routes: [r] });
  });
});

describe('recents remember who found the place (24 §2.4)', () => {
  it('stores source, and an entry saved before it reads as Photon', () => {
    const list = addRecent([], { id: 'g:1', name: 'A', address: '', lat: 12, lng: 77, category: 'fuel', source: 'geoapify' }, 5);
    expect(parseRecents(JSON.stringify(list))[0].source).toBe('geoapify');
    const old = JSON.stringify([{ id: 'N1', name: 'Old', address: '', lat: 12, lng: 77, category: 'cafe', usedAt: 1 }]);
    expect(parseRecents(old)[0]).toMatchObject({ id: 'N1', source: 'photon' });
  });
  it('drops an entry with a bad source', () => {
    const bad = JSON.stringify([{ id: 'x', name: 'X', address: '', lat: 1, lng: 1, category: 'cafe', usedAt: 1, source: 'google' }]);
    expect(parseRecents(bad)).toEqual([]);
  });
});
