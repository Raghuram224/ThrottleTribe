import spriteKeys from '../__fixtures__/ofm-sprite-keys.json';
import { mapStyleFor } from '../map-styles';
import {
  hillshadeBeforeId,
  iconsUsed,
  PARK_MAJOR_CLASSES,
  PEAK_ELE,
  POI_FALLBACK,
  RIDER_POI_CLASSES,
  RIDER_POI_SUBCLASSES,
  tuneStyle,
  tuneStyleWithReport,
  type StyleJson,
} from '../map-style-tune';
import { CASING_WIDTH, NAV_CASING_WIDTH, NAV_ROUTE_WIDTH, ROUTE_WIDTH, routeBeforeId, type StyleLayerLike } from '../route-style';
import { palettes } from '@/theme/tokens';

const layerOf = (style: StyleJson, id: string) => style.layers.find((l) => l.id === id);
const ids = (style: StyleJson) => style.layers.map((l) => l.id);

type Feature = Record<string, unknown> & { $type?: 'Point' | 'LineString' | 'Polygon' };

/** Evaluates the small subset of MapLibre filter expressions our layers use, against one feature's properties. */
function evalExpr(e: unknown, f: Feature): unknown {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e as [string, ...unknown[]];
  const v = (x: unknown) => evalExpr(x, f);
  switch (op) {
    case 'get':
      return f[a[0] as string] ?? null;
    case 'has':
      return f[a[0] as string] != null;
    case 'geometry-type':
      return f.$type ?? 'Point';
    case 'all':
      return a.every((x) => v(x) === true);
    case 'any':
      return a.some((x) => v(x) === true);
    case '!':
      return v(a[0]) !== true;
    case '==':
      return v(a[0]) === v(a[1]);
    case '!=':
      return v(a[0]) !== v(a[1]);
    case '>=':
      return (v(a[0]) as number) >= (v(a[1]) as number);
    case '<':
      return (v(a[0]) as number) < (v(a[1]) as number);
    case '<=':
      return (v(a[0]) as number) <= (v(a[1]) as number);
    case 'match': {
      const input = v(a[0]);
      for (let i = 1; i < a.length - 1; i += 2) {
        const label = a[i];
        if (Array.isArray(label) ? label.includes(input) : label === input) return v(a[i + 1]);
      }
      return v(a[a.length - 1]);
    }
    case 'case': {
      for (let i = 0; i < a.length - 1; i += 2) if (v(a[i]) === true) return v(a[i + 1]);
      return v(a[a.length - 1]);
    }
    case 'coalesce':
      return a.map(v).find((x) => x != null) ?? null;
    case 'literal':
      return a[0];
    default:
      throw new Error(`filter test helper: unsupported ${op}`);
  }
}
const passes = (layer: { filter?: unknown } | undefined, f: Feature) => evalExpr(layer?.filter, f) === true;

// A tiny upstream in Liberty's shape: enough layers for every rule to find its target.
const miniLiberty = (): StyleJson => ({
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'road_motorway', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 5, 'hsl(26,87%,62%)', 6, '#fc8'] } },
    { id: 'road_motorway_link', type: 'line', paint: { 'line-color': '#fc8' } },
    { id: 'bridge_motorway', type: 'line', paint: { 'line-color': '#fc8' } },
    { id: 'bridge_motorway_link', type: 'line', paint: { 'line-color': '#fc8' } },
    { id: 'tunnel_motorway', type: 'line', paint: { 'line-color': '#ffdaa6' } },
    { id: 'tunnel_motorway_link', type: 'line', paint: { 'line-color': '#ffdaa6' } },
    { id: 'road_motorway_casing', type: 'line', paint: { 'line-color': '#e9ac77' } },
    { id: 'tunnel_motorway_casing', type: 'line', paint: { 'line-color': '#e9ac77' } },
    { id: 'road_trunk_primary_casing', type: 'line', paint: { 'line-color': '#e9ac77' } },
    { id: 'building-3d', type: 'fill-extrusion' },
    { id: 'poi_r20', type: 'symbol' },
    { id: 'poi_r7', type: 'symbol' },
    { id: 'poi_transit', type: 'symbol' },
    { id: 'poi_r1', type: 'symbol', minzoom: 15, filter: ['all', ['>=', ['get', 'rank'], 1]], paint: { 'text-color': '#666' } },
    { id: 'highway-name-path', type: 'symbol', paint: { 'text-halo-width': 0.5 } },
    { id: 'highway-name-minor', type: 'symbol', paint: {} },
    { id: 'highway-name-major', type: 'symbol', paint: { 'text-halo-width': 1 } },
  ] as StyleJson['layers'],
});

describe('tuneStyle: tt-liberty (24 §1.2)', () => {
  const { style, report } = tuneStyleWithReport(miniLiberty(), 'tt-liberty');

  it('removes 3D buildings and the noisy POI layers (L1, L2)', () => {
    for (const id of ['building-3d', 'poi_r20', 'poi_r7', 'poi_transit']) expect(layerOf(style, id)).toBeUndefined();
    expect(report.removed.sort()).toEqual(['building-3d', 'poi_r20', 'poi_r7', 'poi_transit']);
  });

  it('keeps only rider POIs from poi_r1 and makes them fainter (L3)', () => {
    const poi = layerOf(style, 'poi_r1');
    // The upstream clause stays, ours joins it (L8 widened the whitelist: see the L8 block below).
    expect((poi?.filter as unknown[])[0]).toBe('all');
    expect((poi?.filter as unknown[])[1]).toEqual(['>=', ['get', 'rank'], 1]);
    expect(poi?.paint).toMatchObject({ 'icon-opacity': 0.75, 'text-opacity': 0.85, 'text-color': '#666' });
    expect(RIDER_POI_CLASSES).toEqual(expect.arrayContaining(['fuel', 'cafe', 'restaurant', 'parking', 'toilets', 'hospital', 'police', 'atm']));
  });

  it('recolours motorways to pale gold at every zoom stop, tunnels lighter, casings tan (L4 to L6)', () => {
    for (const id of ['road_motorway', 'road_motorway_link', 'bridge_motorway', 'bridge_motorway_link']) {
      expect(layerOf(style, id)?.paint?.['line-color']).toBe('#FFE8A3');
    }
    for (const id of ['tunnel_motorway', 'tunnel_motorway_link']) expect(layerOf(style, id)?.paint?.['line-color']).toBe('#FFF1CC');
    for (const id of ['road_motorway_casing', 'tunnel_motorway_casing']) expect(layerOf(style, id)?.paint?.['line-color']).toBe('#D9B26A');
    // Only motorway casings change.
    expect(layerOf(style, 'road_trunk_primary_casing')?.paint?.['line-color']).toBe('#e9ac77');
  });

  it('gives road names a white halo of 1.5 (L7)', () => {
    for (const id of ['highway-name-path', 'highway-name-minor', 'highway-name-major']) {
      expect(layerOf(style, id)?.paint).toMatchObject({ 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 });
    }
  });

  it('does not modify its input and leaves sources, sprite and glyphs on OpenFreeMap', () => {
    const input = miniLiberty();
    const before = JSON.stringify(input);
    const out = tuneStyle(input, 'tt-liberty');
    expect(JSON.stringify(input)).toBe(before);
    expect(out.sources).toEqual(input.sources);
    expect(out.sprite).toBe(input.sprite);
    expect(out.glyphs).toBe(input.glyphs);
    expect(out.name).toBe('tt-liberty');
  });

  it('reports upstream layers it expected but did not find', () => {
    const r = tuneStyleWithReport({ version: 8, layers: [] }, 'tt-liberty');
    expect(r.report.missing).toEqual(expect.arrayContaining(['poi_r1', 'building-3d', 'road_motorway']));
  });
});

describe('tuneStyle: tt-dark (24 §1.2)', () => {
  const upstream: StyleJson = {
    version: 8,
    layers: [
      { id: 'highway_name_other', type: 'symbol', paint: { 'text-color': 'rgba(80, 78, 78, 1)', 'text-halo-color': 'rgba(0, 0, 0, 1)' } },
      { id: 'highway_name_motorway', type: 'symbol', paint: { 'text-color': 'hsl(0,0%,37%)' } },
      ...['place_other', 'place_suburb', 'place_village', 'place_town', 'place_city', 'place_city_large', 'place_state', 'place_country_major'].map((id) => ({
        id,
        type: 'symbol',
        paint: { 'text-color': 'rgb(101,101,101)' },
      })),
    ],
  };
  const style = tuneStyle(upstream, 'tt-dark');
  it('lifts road names (D1) and place names (D2), leaves countries alone', () => {
    // D4 then lifts the road names to #9A9A9A; D1's halo stays.
    expect(layerOf(style, 'highway_name_other')?.paint).toMatchObject({ 'text-color': '#9A9A9A', 'text-halo-color': '#0C0C0C', 'text-halo-width': 1.5 });
    expect(layerOf(style, 'highway_name_motorway')?.paint).toMatchObject({ 'text-color': '#858585', 'text-halo-width': 1.5 });
    // Towns and cities were lifted again by D4 (25); the rest keep D2's colour.
    expect(layerOf(style, 'place_city')?.paint?.['text-color']).toBe('#B5B5B5');
    expect(layerOf(style, 'place_state')?.paint?.['text-color']).toBe('#9A9A9A');
    expect(layerOf(style, 'place_country_major')?.paint?.['text-color']).toBe('rgb(101,101,101)');
    // Nothing upstream is removed (25 adds layers, it removes none from Dark).
    expect(ids(style)).toEqual(expect.arrayContaining(upstream.layers.map((l) => l.id)));
  });
});

describe('the bundled styles (assets/map-styles, built by scripts/build-map-styles.mjs)', () => {
  const liberty = mapStyleFor('tt-liberty');
  const dark = mapStyleFor('tt-dark');

  it('are tuned: Liberty has no 3D or shop POIs, motorways are gold', () => {
    expect(layerOf(liberty, 'building-3d')).toBeUndefined();
    expect(layerOf(liberty, 'poi_r7')).toBeUndefined();
    expect(layerOf(liberty, 'poi_r1')).toBeDefined();
    expect(layerOf(liberty, 'road_motorway')?.paint?.['line-color']).toBe('#FFE8A3');
    expect(layerOf(dark, 'place_city')?.paint?.['text-color']).toBe('#B5B5B5');
    expect(layerOf(dark, 'place_village')?.paint?.['text-color']).toBe('#9A9A9A');
  });

  it('keep tiles, sprites and fonts on OpenFreeMap', () => {
    for (const s of [liberty, dark]) {
      expect(JSON.stringify(s.sources)).toContain('tiles.openfreemap.org');
      expect(String(s.sprite)).toContain('tiles.openfreemap.org');
      expect(String(s.glyphs)).toContain('tiles.openfreemap.org');
    }
  });

  it('routeBeforeId on each bundled style equals the palette token (24 §1.3)', () => {
    expect(routeBeforeId(liberty.layers as StyleLayerLike[])).toBe('highway-name-path');
    expect(routeBeforeId(dark.layers as StyleLayerLike[])).toBe('highway_name_other');
    for (const p of [palettes.tribe, palettes.maps]) {
      expect(routeBeforeId(mapStyleFor(p.light.mapStyle).layers as StyleLayerLike[])).toBe(p.light.routeBeforeId);
      expect(routeBeforeId(mapStyleFor(p.dark.mapStyle).layers as StyleLayerLike[])).toBe(p.dark.routeBeforeId);
    }
  });
});

// ---------------------------------------------------------------- 25: map detail (L8 to L18, D3 to D11)

const order = (style: StyleJson) => ids(style);
const before = (style: StyleJson, a: string, b: string) => expect(order(style).indexOf(a)).toBeLessThan(order(style).indexOf(b));
const poiFeature = (cls: string, subclass: string | undefined, extra: Feature = {}): Feature => ({ class: cls, subclass, rank: 2, name: 'N', ...extra });

describe('tt-liberty detail (25 L8 to L18)', () => {
  const liberty = mapStyleFor('tt-liberty');

  it('L8: poi_r1 accepts rider classes, ATM, mechanics and motorcycle shops; rejects the rest', () => {
    const poi = layerOf(liberty, 'poi_r1');
    for (const cls of ['fuel', 'cafe', 'restaurant', 'fast_food', 'parking', 'toilets', 'hospital', 'police', 'atm']) {
      expect(passes(poi, poiFeature(cls, cls))).toBe(true);
    }
    expect(passes(poi, poiFeature('car', 'car_repair'))).toBe(true);
    expect(passes(poi, poiFeature('shop', 'motorcycle'))).toBe(true);
    // Not in the OpenMapTiles shop list, so not accepted.
    expect(passes(poi, poiFeature('shop', 'motorcycle_repair'))).toBe(false);
    expect(passes(poi, poiFeature('car', 'taxi'))).toBe(false);
    expect(passes(poi, poiFeature('car', 'car_parts'))).toBe(false);
    expect(passes(poi, poiFeature('shop', 'clothes'))).toBe(false);
    expect(passes(poi, poiFeature('florist', 'florist'))).toBe(false);
    expect(passes(poi, poiFeature('bus', 'bus_stop'))).toBe(false);
    expect(passes(poi, poiFeature('fuel', 'fuel', { rank: 7 }))).toBe(false);
    expect(RIDER_POI_SUBCLASSES).toEqual({ car: ['car_repair'], shop: ['motorcycle'] });
    expect(poi?.minzoom).toBe(15);
  });

  it('L8: the ATM wears the bank icon, a mechanic the car icon, and unnamed ones say what they are', () => {
    const poi = layerOf(liberty, 'poi_r1');
    const icon = (cls: string, sub?: string) => evalExpr(poi?.layout?.['icon-image'], { class: cls, subclass: sub });
    expect(icon('atm', 'atm')).toBe('bank');
    expect(icon('shop', 'motorcycle')).toBe('car');
    expect(icon('car', 'car_repair')).toBe('car');
    expect(icon('fuel', 'fuel')).toBe('fuel');
    const text = (f: Feature) => evalExpr(poi?.layout?.['text-field'], f);
    expect(text({ class: 'atm' })).toBe(POI_FALLBACK.atm);
    expect(text({ class: 'car', subclass: 'car_repair' })).toBe(POI_FALLBACK.mechanic);
    expect(text({ class: 'atm', name: 'SBI ATM' })).toBe('SBI ATM');
    expect(POI_FALLBACK).toEqual({ atm: 'ATM', mechanic: 'Mechanic', viewpoint: 'Viewpoint' });
  });

  it('L1 and L2 stay: no 3D buildings and no shop / bus / low-rank POI layers', () => {
    for (const id of ['building-3d', 'poi_r7', 'poi_r20', 'poi_transit']) expect(layerOf(liberty, id)).toBeUndefined();
  });

  it('L9: lodging from z16 and worship from z17, named only, fainter than the rider POIs', () => {
    const lodging = layerOf(liberty, 'tt_poi_lodging');
    const worship = layerOf(liberty, 'tt_poi_worship');
    expect([lodging?.minzoom, worship?.minzoom]).toEqual([16, 17]);
    expect(lodging?.layout?.['icon-image']).toBe('lodging');
    expect(worship?.layout?.['icon-image']).toBe('place_of_worship');
    expect(lodging?.paint).toMatchObject({ 'icon-opacity': 0.6, 'text-opacity': 0.8 });
    expect(passes(lodging, poiFeature('lodging', 'hotel'))).toBe(true);
    expect(passes(lodging, poiFeature('lodging', 'hotel', { name: undefined }))).toBe(false);
    expect(passes(lodging, poiFeature('lodging', 'hotel', { rank: 7 }))).toBe(false);
    expect(passes(lodging, poiFeature('fuel', 'fuel'))).toBe(false);
    expect(passes(worship, poiFeature('place_of_worship', 'place_of_worship'))).toBe(true);
    expect(passes(worship, poiFeature('place_of_worship', 'place_of_worship', { name: undefined, name_en: undefined }))).toBe(false);
  });

  it('L10: peaks with their height, the major one from z9 and up to rank 5 from z12', () => {
    const major = layerOf(liberty, 'tt_peak_major');
    const peak = layerOf(liberty, 'tt_peak');
    expect(major?.['source-layer']).toBe('mountain_peak');
    expect([major?.minzoom, major?.maxzoom, peak?.minzoom]).toEqual([9, 12, 12]);
    expect(passes(major, { class: 'peak', rank: 1, name: 'Kodachadri' })).toBe(true);
    expect(passes(major, { class: 'peak', rank: 2, name: 'Kodachadri' })).toBe(false);
    expect(passes(peak, { class: 'volcano', rank: 5, name: 'X' })).toBe(true);
    expect(passes(peak, { class: 'peak', rank: 6, name: 'X' })).toBe(false);
    expect(passes(peak, { class: 'saddle', rank: 1, name: 'X' })).toBe(false);
    expect(passes(peak, { class: 'peak', rank: 1 })).toBe(false);
    const text = JSON.stringify(peak?.layout?.['text-field']);
    expect(text).toContain('"ele"');
    expect(PEAK_ELE).toBe('{ele} m');
    expect(peak?.layout?.['symbol-sort-key']).toEqual(['get', 'rank']);
    expect(peak?.paint).toMatchObject({ 'text-color': '#6B5444', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 });
  });

  it('L11: viewpoints from z13 (named "Viewpoint" when not), named attractions from z15', () => {
    const view = layerOf(liberty, 'tt_viewpoint');
    const attraction = layerOf(liberty, 'tt_attraction');
    expect([view?.minzoom, attraction?.minzoom]).toEqual([13, 15]);
    expect(passes(view, poiFeature('attraction', 'viewpoint'))).toBe(true);
    expect(passes(view, poiFeature('attraction', 'attraction'))).toBe(false);
    expect(evalExpr(view?.layout?.['text-field'], { class: 'attraction', subclass: 'viewpoint' })).toBe('Viewpoint');
    expect(passes(attraction, poiFeature('attraction', 'attraction'))).toBe(true);
    expect(passes(attraction, poiFeature('attraction', 'attraction', { name: undefined }))).toBe(false);
  });

  it('L12: park names (major from z8, others from z13), dashed outline from z8, a stronger forest', () => {
    const major = layerOf(liberty, 'tt_park_label_major');
    const other = layerOf(liberty, 'tt_park_label');
    expect([major?.minzoom, other?.minzoom]).toEqual([8, 13]);
    expect(PARK_MAJOR_CLASSES).toEqual(expect.arrayContaining(['national_park', 'wildlife_sanctuary', 'nature_reserve']));
    expect(passes(major, { class: 'national_park', name: 'Bandipur' })).toBe(true);
    expect(passes(major, { class: 'reserved_forest', name: 'Bandipur' })).toBe(false);
    expect(passes(other, { class: 'reserved_forest', name: 'Kudremukh' })).toBe(true);
    expect(passes(other, { class: 'national_park', name: 'Bandipur' })).toBe(false);
    expect(passes(major, { class: 'national_park', name: 'Bandipur', $type: 'Polygon' })).toBe(false);
    expect(major?.layout?.['text-font']).toEqual(['Noto Sans Italic']);
    expect(major?.paint).toMatchObject({ 'text-color': '#3D6B35', 'text-halo-width': 1.5 });
    const outline = layerOf(liberty, 'park_outline');
    expect(outline?.minzoom).toBe(8);
    expect(outline?.paint).toMatchObject({ 'line-color': '#8DB87A', 'line-dasharray': [3, 2], 'line-opacity': 0.8 });
    expect(layerOf(liberty, 'landcover_wood')?.paint?.['fill-opacity']).toBe(0.5);
  });

  it('L14: shields only on motorway, trunk, primary and secondary, spaced by zoom', () => {
    const shield = layerOf(liberty, 'highway-shield-non-us');
    const road = (cls: string): Feature => ({ class: cls, ref_length: 4, network: 'road', $type: 'LineString' });
    for (const cls of ['motorway', 'trunk', 'primary', 'secondary']) expect(passes(shield, road(cls))).toBe(true);
    for (const cls of ['tertiary', 'minor', 'service']) expect(passes(shield, road(cls))).toBe(false);
    expect(passes(shield, { ...road('trunk'), ref_length: 7 })).toBe(false);
    expect(shield?.layout?.['symbol-spacing']).toEqual(['interpolate', ['linear'], ['zoom'], 8, 500, 12, 300, 15, 250]);
    expect(shield?.layout?.['text-size']).toBe(10);
  });

  it('L15: unpaved roads get a thin sand-brown dashed centre line under bridges and rail', () => {
    const unpaved = layerOf(liberty, 'tt_road_unpaved');
    expect(unpaved?.minzoom).toBe(12);
    expect(unpaved?.paint).toMatchObject({ 'line-color': '#B89C6E', 'line-dasharray': [2, 2] });
    expect(unpaved?.layout?.['line-cap']).toBe('butt');
    const road = (cls: string, surface: string, brunnel?: string): Feature => ({ class: cls, surface, brunnel, $type: 'LineString' });
    expect(passes(unpaved, road('track', 'unpaved'))).toBe(true);
    expect(passes(unpaved, road('tertiary', 'unpaved'))).toBe(true);
    expect(passes(unpaved, road('tertiary', 'paved'))).toBe(false);
    expect(passes(unpaved, road('path', 'unpaved'))).toBe(false);
    expect(passes(unpaved, road('minor', 'unpaved', 'tunnel'))).toBe(false);
    before(liberty, 'road_trunk_primary', 'tt_road_unpaved');
    before(liberty, 'tt_road_unpaved', 'road_major_rail');
    before(liberty, 'tt_road_unpaved', 'bridge_street');
  });

  it('L16: road names do not wrap round hairpins (max angle 30)', () => {
    for (const id of ['highway-name-path', 'highway-name-minor', 'highway-name-major']) {
      expect(layerOf(liberty, id)?.layout?.['text-max-angle']).toBe(30);
    }
  });

  it('L17: buildings come back from z14 up, flat, with no maxzoom', () => {
    const building = layerOf(liberty, 'building');
    expect(building?.maxzoom).toBeUndefined();
    expect(building?.minzoom).toBe(13);
    expect(building?.type).toBe('fill');
    expect(building?.paint?.['fill-color']).toBe('#DCD9D6');
    expect(liberty.layers.some((l) => l.type === 'fill-extrusion')).toBe(false);
  });

  it('L18: residential tint to z16, new commercial and industrial tints after landuse_school', () => {
    const res = layerOf(liberty, 'landuse_residential');
    expect(res?.maxzoom).toBe(16);
    expect(JSON.stringify(res?.paint?.['fill-color'])).toContain('hsla(35,57%,88%,0.3)');
    const com = layerOf(liberty, 'tt_landuse_commercial');
    const ind = layerOf(liberty, 'tt_landuse_industrial');
    expect(com?.paint?.['fill-color']).toBe('#F2E8DC');
    expect(ind?.paint?.['fill-color']).toBe('#E8E6EC');
    expect(passes(com, { class: 'retail' })).toBe(true);
    expect(passes(com, { class: 'industrial' })).toBe(false);
    expect(passes(ind, { class: 'garages' })).toBe(true);
    expect(order(liberty).indexOf('tt_landuse_commercial')).toBe(order(liberty).indexOf('landuse_school') + 1);
  });

  it('draw order (25 §4.4): new places and peaks sit below poi_r1, all below the route anchor', () => {
    const chain = ['tt_attraction', 'tt_poi_worship', 'tt_poi_lodging', 'tt_park_label', 'tt_park_label_major', 'tt_viewpoint', 'tt_peak', 'tt_peak_major', 'poi_r1'];
    for (let i = 0; i < chain.length - 1; i++) before(liberty, chain[i], chain[i + 1]);
    before(liberty, 'poi_r1', 'highway-name-path');
    before(liberty, 'building', 'tt_attraction');
  });
});

describe('tt-dark detail (25 D3 to D11)', () => {
  const dark = mapStyleFor('tt-dark');
  const paintOf = (id: string) => layerOf(dark, id)?.paint ?? {};

  it('D3: roads are lifted to the new greys', () => {
    expect(paintOf('highway_minor')['line-color']).toBe('#303030');
    expect(paintOf('highway_major_inner')['line-color']).toBe('#383838');
    expect(paintOf('highway_major_casing')['line-color']).toBe('#575757');
    expect(JSON.stringify(paintOf('highway_motorway_inner')['line-color'])).toContain('#404040');
    expect(paintOf('highway_motorway_casing')['line-color']).toBe('#666666');
    expect(paintOf('highway_path')['line-color']).toBe('#2A2A2A');
    expect(paintOf('highway_major_subtle')['line-color']).toBe('#3A3A3A');
    expect(paintOf('highway_motorway_subtle')['line-color']).toBe('#3A3A3A');
  });

  it('D4: road names and town names are brighter, villages are not', () => {
    expect(paintOf('highway_name_other')['text-color']).toBe('#9A9A9A');
    for (const id of ['place_town', 'place_city', 'place_city_large']) expect(paintOf(id)['text-color']).toBe('#B5B5B5');
    expect(paintOf('place_village')['text-color']).toBe('#9A9A9A');
  });

  it('D5: forests draw (no wood-pattern, which the sprite lacks) from z8', () => {
    const wood = layerOf(dark, 'landcover_wood');
    expect(wood?.paint).not.toHaveProperty('fill-pattern');
    expect(wood?.paint).toMatchObject({ 'fill-color': '#121A14', 'fill-opacity': 1 });
    expect(wood?.minzoom).toBe(8);
    expect(iconsUsed(dark)).not.toContain('wood-pattern');
  });

  it('D6: parks get a fill, a dashed outline and names', () => {
    expect(layerOf(dark, 'tt_park')?.paint).toMatchObject({ 'fill-color': '#131C15' });
    expect(layerOf(dark, 'tt_park_outline')?.paint).toMatchObject({ 'line-color': '#2F4A35', 'line-dasharray': [3, 2] });
    expect(layerOf(dark, 'tt_park_label_major')?.paint).toMatchObject({ 'text-color': '#7FA383', 'text-halo-color': '#0C0C0C' });
    before(dark, 'landuse_park', 'tt_park');
    before(dark, 'tt_park', 'waterway');
  });

  it('D7 and D8: buildings and water are visible, river names are readable', () => {
    expect(paintOf('building')).toMatchObject({ 'fill-color': '#1A1A1A', 'fill-outline-color': '#262626' });
    expect(paintOf('water')['fill-color']).toBe('#111B26');
    expect(paintOf('waterway')['line-color']).toBe('#1A2A3A');
    expect(paintOf('water_name')).toMatchObject({ 'text-color': '#7F97B2', 'text-halo-color': '#0C0C0C', 'text-halo-width': 1.5 });
  });

  it('D9 and D10: the same places, peaks and viewpoints as Liberty, in the dark text colour', () => {
    const rider = layerOf(dark, 'tt_poi_rider');
    expect(passes(rider, poiFeature('atm', 'atm'))).toBe(true);
    expect(passes(rider, poiFeature('car', 'car_repair'))).toBe(true);
    expect(passes(rider, poiFeature('car', 'taxi'))).toBe(false);
    expect(passes(rider, poiFeature('shop', 'clothes'))).toBe(false);
    expect(rider?.minzoom).toBe(15);
    for (const id of ['tt_poi_rider', 'tt_poi_lodging', 'tt_poi_worship', 'tt_viewpoint', 'tt_attraction', 'tt_peak', 'tt_peak_major']) {
      expect(layerOf(dark, id)?.paint).toMatchObject({ 'text-color': '#A3A3A3', 'text-halo-color': '#0C0C0C' });
      before(dark, id, 'highway_name_other');
    }
    expect([layerOf(dark, 'tt_poi_lodging')?.minzoom, layerOf(dark, 'tt_poi_worship')?.minzoom]).toEqual([16, 17]);
  });

  it('D11: the shield replaces the motorway ref text; unpaved roads are dashed', () => {
    expect(layerOf(dark, 'highway_name_motorway')?.layout?.visibility).toBe('none');
    const shield = layerOf(dark, 'tt_shield');
    expect(shield?.paint).toMatchObject({ 'icon-opacity': 0.85, 'text-color': '#111111' });
    expect(passes(shield, { class: 'trunk', ref_length: 4, network: 'road', $type: 'LineString' })).toBe(true);
    expect(passes(shield, { class: 'minor', ref_length: 4, network: 'road', $type: 'LineString' })).toBe(false);
    before(dark, 'highway_name_motorway', 'tt_shield');
    expect(layerOf(dark, 'tt_road_unpaved')?.paint).toMatchObject({ 'line-color': '#7A6A52', 'line-dasharray': [2, 2] });
    before(dark, 'tt_road_unpaved', 'railway_transit');
  });
});

describe('the bundled styles as a whole (25)', () => {
  it('every image they ask for is in the committed sprite-key fixture (Dark upstream lacks circle-11 itself)', () => {
    const sprite = new Set(spriteKeys as string[]);
    expect(iconsUsed(mapStyleFor('tt-liberty')).filter((n) => !sprite.has(n))).toEqual([]);
    expect(iconsUsed(mapStyleFor('tt-dark')).filter((n) => !sprite.has(n))).toEqual(['circle-11']);
  });

  it('they ask for the stand-in icons the spec lists', () => {
    const used = iconsUsed(mapStyleFor('tt-liberty'));
    expect(used).toEqual(expect.arrayContaining(['bank', 'car', 'lodging', 'place_of_worship', 'attraction', 'mountain', 'volcano']));
  });

  it('no layer id is used twice and every layer has the source its type needs', () => {
    for (const id of ['tt-liberty', 'tt-dark'] as const) {
      const style = mapStyleFor(id);
      expect(new Set(ids(style)).size).toBe(style.layers.length);
      for (const l of style.layers) {
        if (l.type !== 'background') expect(l.source).toBeDefined();
      }
    }
  });

  it('iconsUsed reads literals out of match, step, case and coalesce', () => {
    const style = {
      layers: [
        { layout: { 'icon-image': ['match', ['get', 'class'], 'a', 'one', ['b', 'c'], 'two', ['get', 'class']] } },
        { layout: { 'icon-image': ['step', ['zoom'], 'three', 10, ''] } },
        { layout: { 'icon-image': ['case', ['has', 'x'], 'four', 'five'] } },
        { layout: { 'icon-image': ['concat', 'road_', ['get', 'n']] } },
        { layout: { 'icon-image': 'six' } },
        { paint: { 'fill-pattern': 'seven' } },
        {},
      ],
    };
    expect(iconsUsed(style)).toEqual(['five', 'four', 'one', 'seven', 'six', 'three', 'two']);
  });

  it('hillshadeBeforeId picks the first water layer after the first land layer', () => {
    const layers = [
      { id: 'water0', 'source-layer': 'water' },
      { id: 'land', 'source-layer': 'landcover' },
      { id: 'park', 'source-layer': 'park' },
      { id: 'river', 'source-layer': 'waterway' },
      { id: 'road', 'source-layer': 'transportation' },
    ];
    expect(hillshadeBeforeId(layers)).toBe('river');
    expect(hillshadeBeforeId([{ id: 'road', 'source-layer': 'transportation' }])).toBeUndefined();
  });

  it('the report lists what was added, and anchors it could not find', () => {
    const { report } = tuneStyleWithReport({ version: 8, layers: [{ id: 'poi_r1', type: 'symbol', filter: ['all'] }, { id: 'building', type: 'fill', maxzoom: 14 }] }, 'tt-liberty');
    expect(report.added).toEqual(['tt_attraction', 'tt_poi_worship', 'tt_poi_lodging', 'tt_park_label', 'tt_park_label_major', 'tt_viewpoint', 'tt_peak', 'tt_peak_major']);
    expect(report.missing).toEqual(expect.arrayContaining(['highway-shield-non-us', 'road_major_rail', 'landuse_school']));
  });
});

// ---------------------------------------------------------------- route widths vs the real Liberty road casing (§1.4)

type Expr = ['interpolate', [string, number?], ['zoom'], ...number[]];

/** Evaluates a MapLibre zoom interpolation (linear or exponential) at `zoom`. */
function evalInterpolate(expr: Expr, zoom: number): number {
  const base = expr[1][0] === 'exponential' ? (expr[1][1] as number) : 1;
  const stops: [number, number][] = [];
  for (let i = 3; i < expr.length; i += 2) stops.push([expr[i] as number, expr[i + 1] as number]);
  if (zoom <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];
  const i = stops.findIndex((s) => s[0] > zoom) - 1;
  const [z0, v0] = stops[i];
  const [z1, v1] = stops[i + 1];
  const t = base === 1 ? (zoom - z0) / (z1 - z0) : (base ** (zoom - z0) - 1) / (base ** (z1 - z0) - 1);
  return v0 + t * (v1 - v0);
}

describe('route widths beat every Liberty road casing from z10 to z19 (24 §1.4)', () => {
  const liberty = mapStyleFor('tt-liberty');
  // The rule is about the highways the route runs along: motorway, trunk and primary casings (the link, street, minor and
  // service casings are narrower at zoom 10 to 17; at z18.5+ local streets get wider, which the spec does not cover).
  const roadCasings = liberty.layers.filter((l) => l.type === 'line' && /^(road|bridge|tunnel)_(motorway|trunk_primary)_casing$/.test(l.id));
  const widest = (zoom: number) =>
    Math.max(...roadCasings.map((l) => evalInterpolate(l.paint?.['line-width'] as Expr, zoom)));
  const zooms = [10, 11, 12, 13, 14, 15, 16, 16.5, 17, 18, 19];

  it('found the road casings it compares against', () => {
    expect(roadCasings.length).toBe(6);
    expect(widest(13)).toBeCloseTo(5.9, 0);
    expect(widest(17)).toBeCloseTo(12.6, 0);
  });

  it('the leader trail casing is wider than any road casing', () => {
    for (const z of zooms) expect(evalInterpolate(CASING_WIDTH, z)).toBeGreaterThan(widest(z));
  });

  it('the stop route casing is wider than any road casing, and sits inside the trail', () => {
    for (const z of zooms) {
      expect(evalInterpolate(NAV_CASING_WIDTH, z)).toBeGreaterThan(widest(z));
      expect(evalInterpolate(NAV_CASING_WIDTH, z)).toBeLessThan(evalInterpolate(CASING_WIDTH, z));
      expect(evalInterpolate(NAV_ROUTE_WIDTH, z)).toBeLessThanOrEqual(evalInterpolate(ROUTE_WIDTH, z));
      expect(evalInterpolate(NAV_ROUTE_WIDTH, z)).toBeLessThan(evalInterpolate(NAV_CASING_WIDTH, z));
    }
  });

  it('the trail keeps growing to z19 (14 / 19.5)', () => {
    expect(evalInterpolate(ROUTE_WIDTH, 19)).toBe(14);
    expect(evalInterpolate(CASING_WIDTH, 19)).toBe(19.5);
    expect(evalInterpolate(NAV_ROUTE_WIDTH, 19)).toBe(13);
    expect(evalInterpolate(NAV_CASING_WIDTH, 19)).toBe(18.5);
  });
});
