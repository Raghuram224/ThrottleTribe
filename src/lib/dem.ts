// Terrain shading (docs/design/25 §3): the elevation source and the hillshade paint. Pure, no imports: native
// (`TerrainLayer`) and web (`hillshade-web.ts`) both draw from here, so the two look the same.

/** Standard = the plain map (no elevation source at all); Terrain = hillshade under the roads (25 T1, T2). */
export type MapLayer = 'standard' | 'terrain';

/** Unknown or missing stored value reads as Standard. */
export function parseMapLayer(value: string | null | undefined): MapLayer {
  return value === 'terrain' ? 'terrain' : 'standard';
}

export type DemProvider = 'mapterhorn' | 'aws';

/** Unknown or missing `EXPO_PUBLIC_DEM_PROVIDER` reads as Mapterhorn. */
export function parseDemProvider(value: string | null | undefined): DemProvider {
  return value === 'aws' ? 'aws' : 'mapterhorn';
}

export const DEM_SOURCE_ID = 'tt-dem';
export const HILLSHADE_LAYER_ID = 'tt-hillshade';
/** Fully transparent at z6, fading in to z7 (the layer has no opacity property, so the colours carry it). */
export const HILLSHADE_MINZOOM = 6;
/** Above 18 the overzoomed z12 data only blurs. */
export const HILLSHADE_MAXZOOM = 18;

export interface DemSource {
  tiles: string[];
  encoding: 'terrarium';
  tileSize: number;
  minzoom: number;
  maxzoom: number;
}

// Never the provider's TileJSON `url`: Mapterhorn's states no maxzoom, so the engine would ask for z13+ tiles that do
// not exist over India (404, holes). `tiles` + an explicit `maxzoom` it is (25 §1.2).
const SOURCES: Record<DemProvider, DemSource> = {
  mapterhorn: {
    tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
    encoding: 'terrarium',
    tileSize: 512,
    minzoom: 5,
    maxzoom: 12,
  },
  // 256 px PNG: z13 at 256 px shows the same ground detail as z12 at 512 px.
  aws: {
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    minzoom: 5,
    maxzoom: 13,
  },
};

/** The raster-dem source props for a provider (§3.1). A fresh copy: callers may not edit the table. */
export function demSourceFor(provider: DemProvider): DemSource {
  const s = SOURCES[provider];
  return { ...s, tiles: [...s.tiles] };
}

/** A MapLibre expression or constant, as the paint properties take it. */
type Expr = unknown;

// Alpha as a fraction of the peak, by zoom: the spec's light-shadow guide (0.30 / 0.26 / 0.18 / 0.10) divided by 0.30, so one
// curve serves both schemes. Held flat from z16.5 to z17: live follow is the faintest.
const ALPHA_CURVE: readonly (readonly [zoom: number, fraction: number])[] = [
  [HILLSHADE_MINZOOM, 0],
  [HILLSHADE_MINZOOM + 1, 1],
  [12, 1],
  [13, 0.867],
  [15, 0.6],
  [16.5, 1 / 3],
  [17, 1 / 3],
];

/**
 * A hillshade colour whose alpha follows zoom: `rgb` is the colour, `peakAlpha` (0 to 1) the strongest alpha it may ever
 * reach. The hillshade layer has no opacity property, so strength by zoom lives in the alpha of the shadow, highlight and
 * accent colours (25 §3.3). Returns a MapLibre colour expression.
 *
 * Contract (the limits in 25 §3.4 are tested against it):
 *  - fully transparent at z6, so the layer fades in from z6 to z7;
 *  - never above `peakAlpha`;
 *  - strongest from z7 through z12 (seeing where the hills are), 0.6 of the peak at z15 (Home's default zoom), a third
 *    at z16.5 to z17 (live follow, where roads, the route and the markers carry the glance);
 *  - monotone: no stop gets stronger as the rider zooms in past z12.
 * The curve follows the spec's light-shadow guide (z7 0.30, z13 0.26, z15 0.18, z17 0.10) as fractions of the peak.
 */
export function colorAlphaByZoom(rgb: readonly [number, number, number], peakAlpha: number): Expr {
  const [r, g, b] = rgb;
  const stops: Expr[] = [];
  for (const [zoom, fraction] of ALPHA_CURVE) {
    stops.push(zoom, `rgba(${r},${g},${b},${Math.round(peakAlpha * fraction * 1000) / 1000})`);
  }
  return ['interpolate', ['linear'], ['zoom'], ...stops];
}

/**
 * Strength by zoom as the hillshade's own `hillshade-exaggeration`: the curve above times `peak`, a number interpolate (which
 * native accepts) that is 0 at z6 and so carries the fade-in from z6 to z7 as well.
 */
export function exaggerationByZoom(peak: number): Expr {
  const stops: number[] = [];
  for (const [zoom, fraction] of ALPHA_CURVE) stops.push(zoom, Math.round(peak * fraction * 1000) / 1000);
  return ['interpolate', ['linear'], ['zoom'], ...stops];
}

export type HillshadeScheme = 'light' | 'dark';

/**
 * Strongest strength per scheme (the hard limits of 25 §3.4), applied through the two properties that reach native:
 * `exaggeration` is the peak of `hillshade-exaggeration`; the hillshade shades with weight = exaggeration x slope, so with the
 * default BLACK shadow and WHITE highlight (we cannot set them on native, see `hillshadePaint`) it is also the strongest alpha
 * of the shade. Light: black at 0.22 over the cream land stays at L 0.45 or more (spec: shadow 0.30 in warm brown; plain black
 * darkens more, so the cap is lower). Dark: white at 0.11 keeps the brightest relief at #272727, under the darkest road.
 * `accent` is the accent colour's alpha (light 0.08 as spec).
 */
export const HILLSHADE_PEAKS = {
  light: { exaggeration: 0.22, accent: 0.08 },
  dark: { exaggeration: 0.11, accent: 0.25 },
} as const;

const LIGHT_BROWN = [84, 70, 52] as const;
const BLACK = [0, 0, 0] as const;

/**
 * The hillshade layer's paint (§3.3). Only two properties, both proven on native:
 *  - `hillshade-exaggeration`, the strength by zoom (a number interpolate);
 *  - `hillshade-accent-color`, a colour interpolate.
 * NOT set, on purpose, because maplibre-react-native 11.5 cannot deliver them to Android:
 *  - `hillshade-illumination-direction` (a plain number reaches `getFloatArray`, a crash) and `-anchor`: the style-spec
 *    defaults are 335 degrees and `viewport`, which is what we want anyway;
 *  - `hillshade-shadow-color` and `hillshade-highlight-color`: native types them as colour ARRAYS. MLRN turns any array whose
 *    first item is a string into an expression (MLRNStyleValue.kt init), a plain colour reaches `getStringArray` as a
 *    number, and native core refuses a `literal` string array as `array<color>`. No form gets through, so they stay the
 *    defaults (black shadow, white highlight) and `HILLSHADE_PEAKS` is tuned for that. The web uses the same paint, so both
 *    look alike. The `standard` method on every platform (T7).
 */
export function hillshadePaint(scheme: HillshadeScheme): Record<string, Expr> {
  const peaks = HILLSHADE_PEAKS[scheme];
  return {
    'hillshade-exaggeration': exaggerationByZoom(peaks.exaggeration),
    'hillshade-accent-color': colorAlphaByZoom(scheme === 'light' ? LIGHT_BROWN : BLACK, peaks.accent),
  };
}

/** The `hillshade` layer without its paint, the same on native and web (`beforeId` is set by the caller). */
export const HILLSHADE_LAYER = {
  id: HILLSHADE_LAYER_ID,
  type: 'hillshade',
  source: DEM_SOURCE_ID,
  minzoom: HILLSHADE_MINZOOM,
  maxzoom: HILLSHADE_MAXZOOM,
} as const;
