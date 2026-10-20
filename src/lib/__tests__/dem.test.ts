import {
  colorAlphaByZoom,
  DEM_SOURCE_ID,
  demSourceFor,
  HILLSHADE_LAYER,
  HILLSHADE_LAYER_ID,
  HILLSHADE_MAXZOOM,
  HILLSHADE_MINZOOM,
  hillshadePaint,
  HILLSHADE_PEAKS,
  parseDemProvider,
  parseMapLayer,
} from '../dem';
import { hillshadeBeforeId } from '../map-style-tune';
import { mapStyleFor } from '../map-styles';
import { palettes } from '@/theme/tokens';

type Stop = [zoom: number, rgb: [number, number, number], alpha: number];

const parseRgba = (s: unknown) => {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(s as string);
  expect(m).not.toBeNull();
  return { rgb: [Number(m![1]), Number(m![2]), Number(m![3])] as [number, number, number], alpha: Number(m![4]) };
};

/**
 * The (zoom, colour, alpha) stops of a zoom colour expression: an `interpolate` of colour strings (the accent colour), or a
 * `step` of one-colour literal arrays (shadow and highlight, which native types as colour ARRAYS). A step's base value is
 * reported at z6, the layer's first zoom.
 */
function stopsOf(expr: unknown): Stop[] {
  const e = expr as unknown[];
  const out: Stop[] = [];
  if (e[0] === 'step') {
    expect(e[1]).toEqual(['zoom']);
    const one = (v: unknown) => {
      const [tag, arr] = v as [string, string[]];
      expect(tag).toBe('literal');
      expect(arr).toHaveLength(1);
      return parseRgba(arr[0]);
    };
    const base = one(e[2]);
    out.push([6, base.rgb, base.alpha]);
    for (let i = 3; i < e.length; i += 2) {
      const c = one(e[i + 1]);
      out.push([e[i] as number, c.rgb, c.alpha]);
    }
    return out;
  }
  expect(e.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']]);
  for (let i = 3; i < e.length; i += 2) {
    const c = parseRgba(e[i + 1]);
    out.push([e[i] as number, c.rgb, c.alpha]);
  }
  return out;
}
const alphas = (expr: unknown) => stopsOf(expr).map((s) => s[2]);

/** WCAG relative luminance of an sRGB colour (0..255 channels). */
function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const over = (base: number[], top: number[], a: number) => base.map((c, i) => c * (1 - a) + top[i] * a);

describe('demSourceFor (25 §3.1)', () => {
  it('Mapterhorn: a tiles list, terrarium WebP at 512 px, capped at z12', () => {
    const s = demSourceFor('mapterhorn');
    expect(s.tiles).toEqual(['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp']);
    expect(s).toMatchObject({ encoding: 'terrarium', tileSize: 512, minzoom: 5, maxzoom: 12 });
  });
  it('AWS fallback: terrarium PNG at 256 px, capped at z13', () => {
    const s = demSourceFor('aws');
    expect(s.tiles).toEqual(['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']);
    expect(s).toMatchObject({ encoding: 'terrarium', tileSize: 256, minzoom: 5, maxzoom: 13 });
  });
  it('never the TileJSON url (it would leave maxzoom at 22 and 404 over India)', () => {
    for (const p of ['mapterhorn', 'aws'] as const) expect(demSourceFor(p)).not.toHaveProperty('url');
  });
  it('hands out a copy', () => {
    demSourceFor('mapterhorn').tiles.push('x');
    expect(demSourceFor('mapterhorn').tiles).toHaveLength(1);
  });
  it('an unknown provider reads as Mapterhorn', () => {
    expect(parseDemProvider('aws')).toBe('aws');
    expect(parseDemProvider('mapterhorn')).toBe('mapterhorn');
    for (const v of ['AWS', '', 'google', undefined, null]) expect(parseDemProvider(v)).toBe('mapterhorn');
  });
});

describe('parseMapLayer (25 T2)', () => {
  it('only "terrain" is Terrain; anything else is Standard', () => {
    expect(parseMapLayer('terrain')).toBe('terrain');
    expect(parseMapLayer('standard')).toBe('standard');
    for (const v of [null, undefined, '', 'Terrain', 'satellite', '1']) expect(parseMapLayer(v)).toBe('standard');
  });
});

describe('the hillshade layer (25 §3.2)', () => {
  it('is z6 to z18 on the tt-dem source', () => {
    expect(HILLSHADE_LAYER).toMatchObject({ id: 'tt-hillshade', type: 'hillshade', source: 'tt-dem', minzoom: 6, maxzoom: 18 });
    expect(HILLSHADE_LAYER_ID).toBe('tt-hillshade');
    expect(DEM_SOURCE_ID).toBe('tt-dem');
    expect([HILLSHADE_MINZOOM, HILLSHADE_MAXZOOM]).toEqual([6, 18]);
  });
  it('hillshadeBeforeId on each bundled style equals the palette token', () => {
    expect(hillshadeBeforeId(mapStyleFor('tt-liberty').layers)).toBe('waterway_tunnel');
    expect(hillshadeBeforeId(mapStyleFor('tt-dark').layers)).toBe('waterway');
    for (const p of [palettes.tribe, palettes.maps]) {
      for (const mode of [p.light, p.dark]) expect(hillshadeBeforeId(mapStyleFor(mode.mapStyle).layers)).toBe(mode.hillshadeBeforeId);
    }
  });
  it('sits above every land fill and below every water, road and label layer', () => {
    for (const id of ['tt-liberty', 'tt-dark'] as const) {
      const layers = mapStyleFor(id).layers;
      const at = layers.findIndex((l) => l.id === hillshadeBeforeId(layers));
      const landAfter = layers.slice(at).filter((l) => l.type === 'fill' && ['landcover', 'landuse', 'park'].includes(l['source-layer'] ?? ''));
      // Only upstream's own late layers (Liberty's sand, drawn over the water) may follow it, never a road or a label.
      expect(landAfter.every((l) => l.id === 'landcover_sand')).toBe(true);
      const roadOrLabelBefore = layers.slice(0, at).filter((l) => l['source-layer'] === 'transportation' || l.type === 'symbol');
      expect(roadOrLabelBefore).toEqual([]);
    }
  });
});

/** Exaggeration (zoom, value) stops. */
const exagStops = (expr: unknown): [number, number][] => {
  const e = expr as unknown[];
  expect(e.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']]);
  const out: [number, number][] = [];
  for (let i = 3; i < e.length; i += 2) out.push([e[i] as number, e[i + 1] as number]);
  return out;
};

describe.each(['light', 'dark'] as const)('hillshadePaint(%s) (25 §3.3, §3.4)', (scheme) => {
  const paint = hillshadePaint(scheme);

  // The native paint object is exactly these two keys. maplibre-react-native 11.5 cannot deliver the others to Android:
  // direction (a plain number -> getFloatArray, a crash), and shadow / highlight colours (typed as colour arrays; MLRN
  // sends any array of strings as an expression, a plain colour reaches getStringArray as a number, and native core
  // refuses a literal string array as array<color>: "Expected array<color> but found array<string, 1>").
  it('pins the native paint shape: exaggeration and accent colour only, both expressions', () => {
    expect(Object.keys(paint).sort()).toEqual(['hillshade-accent-color', 'hillshade-exaggeration']);
    for (const v of Object.values(paint)) {
      expect(Array.isArray(v)).toBe(true);
      expect((v as unknown[])[0]).toBe('interpolate');
    }
    for (const k of ['hillshade-shadow-color', 'hillshade-highlight-color', 'hillshade-illumination-direction', 'hillshade-illumination-anchor']) {
      expect(paint).not.toHaveProperty(k);
    }
  });
  it('leaves the light to the spec defaults (335 degrees, viewport anchor)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { v8 } = require('@maplibre/maplibre-gl-style-spec');
    expect(v8.paint_hillshade['hillshade-illumination-direction'].default).toBe(335);
    expect(v8.paint_hillshade['hillshade-illumination-anchor'].default).toBe('viewport');
    expect(v8.paint_hillshade['hillshade-shadow-color'].default).toBe('#000000');
    expect(v8.paint_hillshade['hillshade-highlight-color'].default).toBe('#FFFFFF');
  });
  it('is transparent at z6 (exaggeration 0, so it fades in to z7) and the accent colour too', () => {
    expect(exagStops(paint['hillshade-exaggeration'])[0]).toEqual([6, 0]);
    expect(stopsOf(paint['hillshade-accent-color'])[0].slice(0, 1).concat(stopsOf(paint['hillshade-accent-color'])[0][2])).toEqual([6, 0]);
  });
  it('the exaggeration peaks at its cap, from z7 to z12, and eases down after (a third at z17)', () => {
    const stops = exagStops(paint['hillshade-exaggeration']);
    const peak = HILLSHADE_PEAKS[scheme].exaggeration;
    expect(Math.max(...stops.map((s) => s[1]))).toBe(peak);
    const at = (z: number) => stops.find((s) => s[0] === z)![1];
    expect([at(7), at(12)]).toEqual([peak, peak]);
    expect(at(15)).toBeCloseTo(peak * 0.6, 3);
    expect(at(17)).toBeCloseTo(peak / 3, 3);
    const after = stops.filter((s) => s[0] >= 12).map((s) => s[1]);
    expect([...after].sort((a, b) => b - a)).toEqual(after);
  });
  it('no accent alpha is above its cap', () => {
    for (const a of alphas(paint['hillshade-accent-color'])) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(HILLSHADE_PEAKS[scheme].accent);
    }
  });
  it('the accent colour is brown on light and black on dark', () => {
    expect(stopsOf(paint['hillshade-accent-color'])[1][1]).toEqual(scheme === 'light' ? [84, 70, 52] : [0, 0, 0]);
  });
});

describe('what native applies is accepted by the web style-spec too', () => {
  it('maplibre-gl 5.24 (style-spec 24.x) and the 26.x style-spec both validate the layer with this paint', () => {
    for (const root of ['@maplibre/maplibre-gl-style-spec', 'maplibre-gl/node_modules/@maplibre/maplibre-gl-style-spec']) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const spec = require(root);
      for (const scheme of ['light', 'dark'] as const) {
        const style = {
          version: 8,
          sources: { d: { type: 'raster-dem', tiles: ['https://x/{z}/{x}/{y}.png'] } },
          layers: [{ id: 'h', type: 'hillshade', source: 'd', paint: hillshadePaint(scheme) }],
        };
        expect({ root, scheme, errors: spec.validateStyleMin(style).map((e: { message: string }) => e.message) }).toEqual({ root, scheme, errors: [] });
      }
    }
  });
});

// The shade is weighted exaggeration x slope (slope <= 1) in the DEFAULT black shadow and white highlight, so the exaggeration
// peak is the strongest alpha either can reach. 25 §3.4 is tested against that, not against colours we cannot set.
describe('the route stays the strongest thing on the map (25 §3.4)', () => {
  it('light: the darkest relief (default black at the exaggeration peak, plus the accent) stays at L 0.45 or more', () => {
    const land = [248, 244, 240];
    const { exaggeration, accent } = HILLSHADE_PEAKS.light;
    const worst = over(over(land, [0, 0, 0], exaggeration), [84, 70, 52], accent);
    expect(luminance(worst)).toBeGreaterThanOrEqual(0.45);
  });
  it('dark: the brightest relief (default white at the exaggeration peak) is darker than the darkest road, #303030', () => {
    const lit = over([12, 12, 12], [255, 255, 255], HILLSHADE_PEAKS.dark.exaggeration);
    expect(Math.max(...lit)).toBeLessThanOrEqual(0x27 + 0.5);
    expect(Math.max(...lit)).toBeLessThan(0x30);
  });
});

// The zoom shape of the colours' alpha (docs/design/25 §3.3 "Strength by zoom").
describe('colorAlphaByZoom', () => {
  const peak = 0.3;
  const stops = stopsOf(colorAlphaByZoom([84, 70, 52], peak));
  /** Alpha at a zoom, linearly interpolated between stops as MapLibre does. */
  const at = (zoom: number) => {
    const i = stops.findIndex((s) => s[0] >= zoom);
    if (i <= 0) return stops[Math.max(0, i)][2];
    const [z0, , a0] = stops[i - 1];
    const [z1, , a1] = stops[i];
    return a0 + ((zoom - z0) / (z1 - z0)) * (a1 - a0);
  };

  it('is transparent at z6 and never above the peak', () => {
    expect(at(6)).toBe(0);
    for (const s of stops) expect(s[2]).toBeLessThanOrEqual(peak);
  });
  it('is strongest from z7 through z12 (where the hills are)', () => {
    for (const z of [7, 9, 12]) expect(at(z)).toBeCloseTo(peak, 5);
  });
  it('is 0.6 of the peak at z15 (Home default zoom)', () => {
    expect(at(15)).toBeCloseTo(0.18, 3);
  });
  it('is faintest at z16.5 to z17 (live follow: roads, route and markers carry the glance)', () => {
    expect(at(16.5)).toBeCloseTo(0.1, 3);
    expect(at(17)).toBeCloseTo(0.1, 3);
    expect(at(16.5)).toBeLessThan(at(15));
  });
  it('never gets stronger as the rider zooms in past z12', () => {
    let prev = at(12);
    for (let z = 12.25; z <= 18; z += 0.25) {
      expect(at(z)).toBeLessThanOrEqual(prev + 1e-9);
      prev = at(z);
    }
  });
  it('matches the spec guide for the light shadow: z7 0.30, z13 0.26, z15 0.18, z17 0.10', () => {
    expect([7, 13, 15, 17].map((z) => Math.round(at(z) * 100) / 100)).toEqual([0.3, 0.26, 0.18, 0.1]);
  });
  it('scales with the peak, so one curve serves both schemes', () => {
    const dark = stopsOf(colorAlphaByZoom([0, 0, 0], 0.55));
    expect(dark.map((s) => s[2] / 0.55)).toEqual(stops.map((s) => expect.closeTo(s[2] / peak, 2)));
  });
});
