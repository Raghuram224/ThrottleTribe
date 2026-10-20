// Our tuning of the OpenFreeMap styles (docs/design/24 §1.2, 25 §4): pure, no imports, only erasable TypeScript, so
// scripts/build-map-styles.mjs can run it with Node's built-in type stripping and Jest can test it.
// `tuneStyle(upstream, id)` takes the upstream style JSON and returns ours; tiles, sprite and glyphs stay on OpenFreeMap.
// Rule numbers are the specs': L1 to L7 / D1 to D2 are 24, L8 to L18 / D3 to D11 are 25.

export type MapStyleId = 'tt-liberty' | 'tt-dark';

// A style is plain JSON; the tuning only touches a few fields, so a loose shape keeps this file free of imports.
export interface StyleLayer {
  id: string;
  type: string;
  'source-layer'?: string;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface StyleJson {
  version: number;
  name?: string;
  layers: StyleLayer[];
  [k: string]: unknown;
}

export interface TuneReport {
  removed: string[];
  changed: string[];
  /** Layers the tuning added (25). */
  added: string[];
  /** Layers the tuning expected but the upstream style no longer has (the script prints them as a warning). */
  missing: string[];
}

/** POI classes riders care about (L3, L8: ATM joins). */
export const RIDER_POI_CLASSES = ['fuel', 'cafe', 'restaurant', 'fast_food', 'parking', 'toilets', 'hospital', 'police', 'atm'];
/** Classes whose POIs are only wanted for some subclasses: a mechanic is `car` + `car_repair`, a bike shop is `shop` + `motorcycle`. */
export const RIDER_POI_SUBCLASSES: Record<string, string[]> = {
  car: ['car_repair'],
  // `shop=motorcycle` is the only motorcycle value in the OpenMapTiles poi mapping (there is no `motorcycle_repair`).
  shop: ['motorcycle'],
};
/** Names for unnamed ATMs, mechanics and viewpoints. The style cannot read copy.ts: change both together (25 §8). */
export const POI_FALLBACK = { atm: 'ATM', mechanic: 'Mechanic', viewpoint: 'Viewpoint' };
/** Second line of a peak label; `{ele}` is the height in metres. */
export const PEAK_ELE = '{ele} m';
/** `park` points that get a label from z8; the rest wait for z13 (L12). */
export const PARK_MAJOR_CLASSES = ['national_park', 'nature_reserve', 'wildlife_sanctuary', 'tiger_reserve', 'biosphere_reserve', 'protected_area'];
/**
 * POI classes whose sprite icon is too faint on the near-black map: their label carries them (D9). Filled from device QA
 * (25 §14.8); the sprite was drawn for light maps and the build cannot measure its pixels.
 */
export const TEXT_FIRST_CLASSES: string[] = [];

const MOTORWAY_LINE = '#FFE8A3';
const MOTORWAY_CASING = '#D9B26A';
const MOTORWAY_TUNNEL = '#FFF1CC';

const LIBERTY_REMOVED = ['building-3d', 'poi_r7', 'poi_r20', 'poi_transit'];
const LIBERTY_MOTORWAY = ['road_motorway', 'road_motorway_link', 'bridge_motorway', 'bridge_motorway_link'];
const LIBERTY_TUNNEL_MOTORWAY = ['tunnel_motorway', 'tunnel_motorway_link'];
const LIBERTY_ROAD_NAMES = ['highway-name-path', 'highway-name-minor', 'highway-name-major'];
const DARK_ROAD_NAMES = ['highway_name_other', 'highway_name_motorway'];
const DARK_PLACES = ['place_other', 'place_suburb', 'place_village', 'place_town', 'place_city', 'place_city_large', 'place_state'];
const DARK_BIG_PLACES = ['place_town', 'place_city', 'place_city_large'];

const HALO_DARK = '#0C0C0C';
const UNPAVED_CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track'];

// The upstream label expressions, as they are in both styles.
const NAME = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name_en'], ['get', 'name']]];
const HAS_NAME = ['any', ['has', 'name'], ['has', 'name_en']];
const IS_POINT = ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false];
const UPSTREAM_POI_ICON = ['match', ['get', 'subclass'], ['florist', 'furniture'], ['get', 'subclass'], ['get', 'class']];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

type Scheme = 'light' | 'dark';
interface LabelLook {
  font: string;
  color: string;
  halo: string;
  haloWidth: number;
}
const POI_LOOK: Record<Scheme, LabelLook> = {
  light: { font: 'Noto Sans Italic', color: '#666666', halo: '#FFFFFF', haloWidth: 1.5 },
  dark: { font: 'Noto Sans Italic', color: '#A3A3A3', halo: HALO_DARK, haloWidth: 1.5 },
};
const PEAK_COLOR: Record<Scheme, string> = { light: '#6B5444', dark: '#A3A3A3' };
const PARK_LABEL_COLOR: Record<Scheme, string> = { light: '#3D6B35', dark: '#7FA383' };

/** L8 / D9 filter: rider classes, mechanics (`car` + `car_repair`) and motorcycle shops. */
function riderPoiClause(): unknown[] {
  const bySubclass = Object.entries(RIDER_POI_SUBCLASSES).map(([cls, subs]) => [
    'all',
    ['==', ['get', 'class'], cls],
    ['match', ['get', 'subclass'], subs, true, false],
  ]);
  return ['any', ['match', ['get', 'class'], RIDER_POI_CLASSES, true, false], ...bySubclass];
}

/** L8 icons: ATM has no sprite icon (`bank` stands in), a mechanic or bike shop wears `car` (T9). */
const RIDER_POI_ICON = ['match', ['get', 'class'], 'atm', 'bank', 'shop', 'car', UPSTREAM_POI_ICON];
/** L8 text: the name, else what the place is. */
const RIDER_POI_TEXT = [
  'coalesce',
  NAME,
  ['match', ['get', 'class'], 'atm', POI_FALLBACK.atm, ['car', 'shop'], POI_FALLBACK.mechanic, ''],
];

function poiLayout(look: LabelLook, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    'text-anchor': 'top',
    'text-font': [look.font],
    'text-max-width': 9,
    'text-offset': [0, 0.6],
    'text-size': 12,
    ...extra,
  };
}
function poiPaint(look: LabelLook, iconOpacity: unknown, textOpacity: number): Record<string, unknown> {
  return {
    'icon-opacity': iconOpacity,
    'text-opacity': textOpacity,
    'text-color': look.color,
    'text-halo-blur': 0.5,
    'text-halo-color': look.halo,
    'text-halo-width': look.haloWidth,
  };
}

/** Dark icon opacity: 0.7, or 0 for classes that go text-first (D9). */
function darkIconOpacity(): unknown {
  return TEXT_FIRST_CLASSES.length ? ['match', ['get', 'class'], TEXT_FIRST_CLASSES, 0, 0.7] : 0.7;
}

const poiLayer = (id: string, scheme: Scheme, o: { minzoom: number; filter: unknown[]; layout: Record<string, unknown>; iconOpacity: number | unknown; textOpacity: number }): StyleLayer => ({
  id,
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'poi',
  minzoom: o.minzoom,
  filter: ['all', IS_POINT, ...o.filter],
  layout: poiLayout(POI_LOOK[scheme], o.layout),
  paint: poiPaint(POI_LOOK[scheme], o.iconOpacity, o.textOpacity),
});

// L9: a bed for the night (z16) and places of worship (z17, one generic icon for every faith). Named only.
const lodgingLayer = (scheme: Scheme): StyleLayer =>
  poiLayer('tt_poi_lodging', scheme, {
    minzoom: 16,
    filter: [['==', ['get', 'class'], 'lodging'], ['>=', ['get', 'rank'], 1], ['<', ['get', 'rank'], 7], HAS_NAME],
    layout: { 'icon-image': 'lodging', 'text-field': NAME },
    iconOpacity: scheme === 'dark' ? darkIconOpacity() : 0.6,
    textOpacity: 0.8,
  });
const worshipLayer = (scheme: Scheme): StyleLayer =>
  poiLayer('tt_poi_worship', scheme, {
    minzoom: 17,
    filter: [['==', ['get', 'class'], 'place_of_worship'], ['>=', ['get', 'rank'], 1], ['<', ['get', 'rank'], 7], HAS_NAME],
    layout: { 'icon-image': 'place_of_worship', 'text-field': NAME },
    iconOpacity: scheme === 'dark' ? darkIconOpacity() : 0.6,
    textOpacity: 0.8,
  });
// D9: Dark has no POI layer upstream, so this is L8 as a layer of our own.
const riderLayer = (): StyleLayer =>
  poiLayer('tt_poi_rider', 'dark', {
    minzoom: 15,
    filter: [['>=', ['get', 'rank'], 1], ['<', ['get', 'rank'], 7], riderPoiClause()],
    layout: { 'icon-image': RIDER_POI_ICON, 'text-field': RIDER_POI_TEXT },
    iconOpacity: darkIconOpacity(),
    textOpacity: 0.85,
  });

// L11: viewpoints are ride stops (z13); named attractions (z15) carry most waterfalls (T8).
const viewpointLayer = (scheme: Scheme): StyleLayer =>
  poiLayer('tt_viewpoint', scheme, {
    minzoom: 13,
    filter: [['==', ['get', 'class'], 'attraction'], ['==', ['get', 'subclass'], 'viewpoint']],
    layout: { 'icon-image': 'attraction', 'text-field': ['coalesce', NAME, POI_FALLBACK.viewpoint] },
    iconOpacity: scheme === 'dark' ? darkIconOpacity() : 0.75,
    textOpacity: 1,
  });
const attractionLayer = (scheme: Scheme): StyleLayer =>
  poiLayer('tt_attraction', scheme, {
    minzoom: 15,
    filter: [['==', ['get', 'class'], 'attraction'], ['==', ['get', 'subclass'], 'attraction'], ['>=', ['get', 'rank'], 1], ['<', ['get', 'rank'], 7], HAS_NAME],
    layout: { 'icon-image': 'attraction', 'text-field': NAME },
    iconOpacity: scheme === 'dark' ? darkIconOpacity() : 0.75,
    textOpacity: 1,
  });

// L10: peaks with their height in metres. The second line is regular weight, the name bold.
const peakText = (): unknown => {
  const [before, after] = PEAK_ELE.split('{ele}');
  return [
    'format',
    NAME,
    { 'text-font': ['literal', ['Noto Sans Bold']] },
    ['case', ['has', 'ele'], ['concat', '\n', before, ['to-string', ['get', 'ele']], after], ''],
    { 'text-font': ['literal', ['Noto Sans Regular']] },
  ];
};
const peakLayer = (id: string, scheme: Scheme, minzoom: number, maxzoom: number | undefined, rank: unknown[]): StyleLayer => ({
  id,
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'mountain_peak',
  minzoom,
  ...(maxzoom === undefined ? {} : { maxzoom }),
  filter: ['all', ['match', ['get', 'class'], ['peak', 'volcano'], true, false], HAS_NAME, rank],
  layout: {
    'icon-image': ['match', ['get', 'class'], 'volcano', 'volcano', 'mountain'],
    'symbol-sort-key': ['get', 'rank'],
    'text-anchor': 'top',
    'text-field': peakText(),
    'text-font': ['Noto Sans Bold'],
    'text-max-width': 8,
    'text-offset': [0, 0.6],
    'text-optional': false,
    'text-size': ['interpolate', ['linear'], ['zoom'], 9, 12, 15, 14],
  },
  paint: {
    'icon-opacity': scheme === 'dark' ? 0.7 : 0.8,
    'text-color': PEAK_COLOR[scheme],
    'text-halo-color': scheme === 'dark' ? HALO_DARK : '#FFFFFF',
    'text-halo-width': 1.5,
  },
});

// L12 / D6: national parks, sanctuaries and reserved forests, labelled from the `park` points.
const parkLabelLayer = (id: string, scheme: Scheme, major: boolean): StyleLayer => ({
  id,
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'park',
  minzoom: major ? 8 : 13,
  filter: ['all', IS_POINT, HAS_NAME, major ? ['match', ['get', 'class'], PARK_MAJOR_CLASSES, true, false] : ['!', ['match', ['get', 'class'], PARK_MAJOR_CLASSES, true, false]]],
  layout: {
    'symbol-sort-key': ['get', 'rank'],
    'text-field': NAME,
    'text-font': ['Noto Sans Italic'],
    'text-max-width': 8,
    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 13, 14],
  },
  paint: {
    'text-color': PARK_LABEL_COLOR[scheme],
    'text-halo-color': scheme === 'dark' ? HALO_DARK : '#FFFFFF',
    'text-halo-width': 1.5,
  },
});

// L15 / D11: a dashed centre line says "not tarmac". Thinner and another colour than the dashed route fallback.
const unpavedLayer = (color: string): StyleLayer => ({
  id: 'tt_road_unpaved',
  type: 'line',
  source: 'openmaptiles',
  'source-layer': 'transportation',
  minzoom: 12,
  filter: [
    'all',
    ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
    ['==', ['get', 'surface'], 'unpaved'],
    ['match', ['get', 'class'], UNPAVED_CLASSES, true, false],
    ['!=', ['get', 'brunnel'], 'tunnel'],
  ],
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: {
    'line-color': color,
    'line-dasharray': [2, 2],
    'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 12, 0.75, 14, 1.25, 16, 2, 20, 4],
  },
});

// L14 / D11: NH and SH refs on the road class that carries them; the ref text tells them apart. Same sprite as Liberty's.
const SHIELD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary'];
const SHIELD_SPACING = ['interpolate', ['linear'], ['zoom'], 8, 500, 12, 300, 15, 250];
const shieldLayer = (): StyleLayer => ({
  id: 'tt_shield',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'transportation_name',
  minzoom: 8,
  filter: [
    'all',
    ['<=', ['get', 'ref_length'], 6],
    ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
    ['match', ['get', 'network'], ['us-highway', 'us-interstate', 'us-state'], false, true],
    ['match', ['get', 'class'], SHIELD_CLASSES, true, false],
  ],
  layout: {
    'icon-image': ['concat', 'road_', ['get', 'ref_length']],
    'icon-rotation-alignment': 'viewport',
    'icon-size': 1,
    'symbol-placement': ['step', ['zoom'], 'point', 11, 'line'],
    'symbol-spacing': SHIELD_SPACING,
    'text-field': ['to-string', ['get', 'ref']],
    'text-font': ['Noto Sans Regular'],
    'text-rotation-alignment': 'viewport',
    'text-size': 10,
  },
  paint: { 'icon-opacity': 0.85, 'text-color': '#111111' },
});

const commercialLayer = (): StyleLayer => ({
  id: 'tt_landuse_commercial',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landuse',
  minzoom: 12,
  filter: ['match', ['get', 'class'], ['commercial', 'retail'], true, false],
  paint: { 'fill-color': '#F2E8DC', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.6] },
});
const industrialLayer = (): StyleLayer => ({
  id: 'tt_landuse_industrial',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landuse',
  minzoom: 12,
  filter: ['match', ['get', 'class'], ['industrial', 'garages', 'railway'], true, false],
  paint: { 'fill-color': '#E8E6EC', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.6] },
});

/** Where the hillshade goes (25 §3.2): above the land fills, below the water lines, so below every road, label and marker. */
const LAND_SOURCE_LAYERS = ['landcover', 'landuse', 'park'];
const WATER_SOURCE_LAYERS = ['water', 'waterway'];

/**
 * Id of the layer the hillshade is inserted before: the first water / waterway layer that follows the first land layer.
 * (The spec's wording, "after the last land fill", would pick Liberty's `landcover_sand`, which upstream draws above the
 * water; the first-water rule gives the spec's tokens `waterway_tunnel` / `waterway` in both styles.)
 */
export function hillshadeBeforeId(layers: readonly { id: string; 'source-layer'?: string }[]): string | undefined {
  const firstLand = layers.findIndex((l) => LAND_SOURCE_LAYERS.includes(l['source-layer'] ?? ''));
  if (firstLand < 0) return undefined;
  return layers.slice(firstLand).find((l) => WATER_SOURCE_LAYERS.includes(l['source-layer'] ?? ''))?.id;
}

/** Every literal sprite image a style asks for (`icon-image`, `fill-pattern`), including `match` / `step` / `case` outputs. */
export function iconsUsed(style: { layers: readonly { layout?: Record<string, unknown>; paint?: Record<string, unknown> }[] }): string[] {
  const names = new Set<string>();
  const literal = (v: unknown) => {
    // Tokens ("{class}") and empty strings are not image names.
    if (typeof v === 'string' && v !== '' && !v.includes('{')) names.add(v);
  };
  // Outputs of the expressions that pick between literals; `get` / `concat` build names at run time and cannot be checked.
  const walk = (e: unknown): void => {
    if (!Array.isArray(e)) return literal(e);
    const [op, ...rest] = e as [string, ...unknown[]];
    if (op === 'match') {
      for (let i = 2; i < rest.length - 1; i += 2) walk(rest[i]);
      walk(rest[rest.length - 1]);
    } else if (op === 'case') {
      for (let i = 1; i < rest.length - 1; i += 2) walk(rest[i]);
      walk(rest[rest.length - 1]);
    } else if (op === 'step') {
      walk(rest[1]);
      for (let i = 3; i < rest.length; i += 2) walk(rest[i]);
    } else if (op === 'coalesce') {
      rest.forEach(walk);
    } else if (op === 'literal') {
      literal(rest[0]);
    }
  };
  for (const l of style.layers) {
    walk(l.layout?.['icon-image']);
    walk(l.paint?.['fill-pattern']);
  }
  return [...names].sort();
}

/** Applies the tuning and says what it did. The input is not modified. */
export function tuneStyleWithReport(upstream: StyleJson, id: MapStyleId): { style: StyleJson; report: TuneReport } {
  const style = clone(upstream);
  const report: TuneReport = { removed: [], changed: [], added: [], missing: [] };
  const byId = (layerId: string): StyleLayer | undefined => style.layers.find((l) => l.id === layerId);
  const markChanged = (layerId: string) => {
    if (!report.changed.includes(layerId)) report.changed.push(layerId);
  };
  const patch = (layerId: string, paint: Record<string, unknown>, layout?: Record<string, unknown>) => {
    const layer = byId(layerId);
    if (!layer) {
      report.missing.push(layerId);
      return;
    }
    layer.paint = { ...(layer.paint ?? {}), ...paint };
    if (layout) layer.layout = { ...(layer.layout ?? {}), ...layout };
    markChanged(layerId);
  };
  // Edits that are not a paint / layout merge (filters, zoom range, deleted keys).
  const edit = (layerId: string, fn: (layer: StyleLayer) => void) => {
    const layer = byId(layerId);
    if (!layer) {
      report.missing.push(layerId);
      return;
    }
    fn(layer);
    markChanged(layerId);
  };
  // Inserts `layers` (in the order given) right before `anchorId`.
  const insertBefore = (anchorId: string, ...layers: StyleLayer[]) => {
    const at = style.layers.findIndex((l) => l.id === anchorId);
    if (at < 0) {
      report.missing.push(anchorId);
      return;
    }
    style.layers.splice(at, 0, ...layers);
    report.added.push(...layers.map((l) => l.id));
  };
  const insertAfter = (anchorId: string, ...layers: StyleLayer[]) => {
    const at = style.layers.findIndex((l) => l.id === anchorId);
    if (at < 0) {
      report.missing.push(anchorId);
      return;
    }
    style.layers.splice(at + 1, 0, ...layers);
    report.added.push(...layers.map((l) => l.id));
  };

  style.name = id;

  if (id === 'tt-liberty') {
    // L1, L2: no 3D (pitch is off) and no shop / florist / bus-stop noise.
    for (const layerId of LIBERTY_REMOVED) {
      if (byId(layerId)) report.removed.push(layerId);
      else report.missing.push(layerId);
    }
    style.layers = style.layers.filter((l) => !LIBERTY_REMOVED.includes(l.id));

    // L3 / L8: only rider POIs (ATM, mechanic and bike shop joined in 25), fainter than any rider marker. The upstream
    // filter is `["all", ...]`; one more clause joins it.
    edit('poi_r1', (poi) => {
      const clause = riderPoiClause();
      const f = poi.filter;
      poi.filter = Array.isArray(f) && f[0] === 'all' ? [...f, clause] : f ? ['all', f, clause] : clause;
      poi.layout = { ...(poi.layout ?? {}), 'icon-image': RIDER_POI_ICON, 'text-field': RIDER_POI_TEXT };
      poi.paint = { ...(poi.paint ?? {}), 'icon-opacity': 0.75, 'text-opacity': 0.85 };
    });

    // L4, L5, L6: no road shares a hue with the orange (Tribe) or blue (Maps) route. A constant replaces the
    // zoom-stop colours, so the z5 orange goes too.
    for (const layerId of LIBERTY_MOTORWAY) patch(layerId, { 'line-color': MOTORWAY_LINE });
    for (const layerId of LIBERTY_TUNNEL_MOTORWAY) patch(layerId, { 'line-color': MOTORWAY_TUNNEL });
    for (const l of style.layers) {
      if (l.type === 'line' && /motorway/.test(l.id) && /_casing$/.test(l.id)) patch(l.id, { 'line-color': MOTORWAY_CASING });
    }

    // L7: road names are drawn above the route, so they need a halo to stay readable over it.
    for (const layerId of LIBERTY_ROAD_NAMES) patch(layerId, { 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 });

    // L9, L10, L11, L12 labels: draw below `poi_r1` (so rider POIs win collisions) and below the route. Bottom to top, 25 §4.4.
    insertBefore(
      'poi_r1',
      attractionLayer('light'),
      worshipLayer('light'),
      lodgingLayer('light'),
      parkLabelLayer('tt_park_label', 'light', false),
      parkLabelLayer('tt_park_label_major', 'light', true),
      viewpointLayer('light'),
      peakLayer('tt_peak', 'light', 12, undefined, ['<=', ['get', 'rank'], 5]),
      peakLayer('tt_peak_major', 'light', 9, 12, ['==', ['get', 'rank'], 1]),
    );

    // L12: park outlines are the visible edge of a national park; forests a little stronger.
    patch(
      'park_outline',
      {
        'line-color': '#8DB87A',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 14, 1.5],
        'line-dasharray': [3, 2],
        'line-opacity': 0.8,
      },
    );
    edit('park_outline', (l) => {
      l.minzoom = 8;
    });
    patch('landcover_wood', { 'fill-opacity': 0.5 });

    // L14: shields only on the road classes that carry NH / SH refs, spaced by zoom.
    edit('highway-shield-non-us', (l) => {
      const clause = ['match', ['get', 'class'], SHIELD_CLASSES, true, false];
      const f = l.filter;
      l.filter = Array.isArray(f) && f[0] === 'all' ? [...f, clause] : f ? ['all', f, clause] : clause;
      l.layout = { ...(l.layout ?? {}), 'symbol-spacing': SHIELD_SPACING };
    });

    // L15: unpaved stretches, above the road fills and below bridges and rail.
    insertBefore('road_major_rail', unpavedLayer('#B89C6E'));

    // L16: road names must not wrap round hairpins and hide the bend.
    for (const layerId of LIBERTY_ROAD_NAMES) patch(layerId, {}, { 'text-max-angle': 30 });

    // L17: upstream draws the flat `building` only to z14 because 3D took over (L1 removed it), so every building from
    // z14 up vanished. No maxzoom, still flat.
    edit('building', (l) => {
      delete l.maxzoom;
      l.paint = { ...(l.paint ?? {}), 'fill-color': '#DCD9D6' };
    });

    // L18: built-up areas readable in towns.
    edit('landuse_residential', (l) => {
      l.maxzoom = 16;
      l.paint = {
        ...(l.paint ?? {}),
        'fill-color': ['interpolate', ['linear'], ['zoom'], 9, 'hsla(0,3%,85%,0.84)', 12, 'hsla(35,57%,88%,0.49)', 15, 'hsla(35,57%,88%,0.3)'],
      };
    });
    insertAfter('landuse_school', commercialLayer(), industrialLayer());
  } else {
    // D1, D2: upstream road names are 2.4:1 and place names 3.4:1 on the near-black land.
    for (const layerId of DARK_ROAD_NAMES) {
      patch(layerId, { 'text-color': '#858585', 'text-halo-color': HALO_DARK, 'text-halo-width': 1.5 });
    }
    for (const layerId of DARK_PLACES) patch(layerId, { 'text-color': '#9A9A9A' });

    // D3: roads were too faint (emulator QA). Still monochrome, so no hue meets a route colour.
    patch('highway_minor', { 'line-color': '#303030' });
    patch('highway_major_inner', { 'line-color': '#383838' });
    patch('highway_major_casing', { 'line-color': '#575757' });
    patch('highway_motorway_inner', { 'line-color': ['interpolate', ['linear'], ['zoom'], 5.8, 'hsla(0,0%,85%,0.53)', 6, '#404040'] });
    patch('highway_motorway_casing', { 'line-color': '#666666' });
    patch('highway_path', { 'line-color': '#2A2A2A' });
    patch('highway_major_subtle', { 'line-color': '#3A3A3A' });
    patch('highway_motorway_subtle', { 'line-color': '#3A3A3A' });

    // D4: brighter roads need brighter names, and towns stay above them in the hierarchy.
    patch('highway_name_other', { 'text-color': '#9A9A9A' });
    for (const layerId of DARK_BIG_PLACES) patch(layerId, { 'text-color': '#B5B5B5' });

    // D5: `wood-pattern` is not in the sprite, so forests drew nothing. A plain faint green-black fill instead.
    edit('landcover_wood', (l) => {
      l.minzoom = 8;
      const paint: Record<string, unknown> = { ...(l.paint ?? {}), 'fill-color': '#121A14', 'fill-opacity': 1 };
      delete paint['fill-pattern'];
      l.paint = paint;
    });

    // D6: national parks and protected areas on the dark map at all.
    insertAfter(
      'landuse_park',
      {
        id: 'tt_park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        minzoom: 6,
        paint: { 'fill-color': '#131C15' },
      },
      {
        id: 'tt_park_outline',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'park',
        minzoom: 9,
        paint: { 'line-color': '#2F4A35', 'line-width': 1, 'line-dasharray': [3, 2] },
      },
    );

    // D7: buildings were darker than the land, so invisible.
    patch('building', { 'fill-color': '#1A1A1A', 'fill-outline-color': '#262626' });

    // D8: rivers and lakes help orientation in ghats at night; their names were black on black.
    patch('water', { 'fill-color': '#111B26' });
    patch('waterway', { 'line-color': '#1A2A3A', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 3] });
    patch('water_name', { 'text-color': '#7F97B2', 'text-halo-color': HALO_DARK, 'text-halo-width': 1.5 });

    // D9, D10, D6 labels: Dark has no POIs upstream. Same order as Liberty (25 §4.4), all under the route.
    insertBefore(
      'highway_name_other',
      attractionLayer('dark'),
      worshipLayer('dark'),
      lodgingLayer('dark'),
      parkLabelLayer('tt_park_label', 'dark', false),
      parkLabelLayer('tt_park_label_major', 'dark', true),
      viewpointLayer('dark'),
      peakLayer('tt_peak', 'dark', 12, undefined, ['<=', ['get', 'rank'], 5]),
      peakLayer('tt_peak_major', 'dark', 9, 12, ['==', ['get', 'rank'], 1]),
      riderLayer(),
    );

    // D11: the shield replaces the motorway ref text (one fact, one place); unpaved stretches.
    patch('highway_name_motorway', {}, { visibility: 'none' });
    insertAfter('highway_name_motorway', shieldLayer());
    insertBefore('railway_transit', unpavedLayer('#7A6A52'));
  }
  return { style, report };
}

export function tuneStyle(upstream: StyleJson, id: MapStyleId): StyleJson {
  return tuneStyleWithReport(upstream, id).style;
}

/** Upstream style URL for each of ours. */
export const UPSTREAM_STYLE_URL: Record<MapStyleId, string> = {
  'tt-liberty': 'https://tiles.openfreemap.org/styles/liberty',
  'tt-dark': 'https://tiles.openfreemap.org/styles/dark',
};
