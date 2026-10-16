// Route highlight geometry shared by every map (16 §2.5): Live and Summary, native and web.
// Zoom-scaled widths; the casing is always ~1.5 dp wider on each side than the line.
export type ZoomWidth = ['interpolate', ['linear'], ['zoom'], ...number[]];

export const ROUTE_WIDTH: ZoomWidth = ['interpolate', ['linear'], ['zoom'], 8, 4, 11, 5, 13, 6.5, 15, 8.5, 17, 11];
export const CASING_WIDTH: ZoomWidth = ['interpolate', ['linear'], ['zoom'], 8, 7, 11, 8, 13, 9.5, 15, 12, 17, 15];
export const TRAIL_SOURCE_ID = 'leader-trail';
/** Crossed part of the leader trail: thin, faded, no casing (satnav style: the road behind recedes). */
export const PASSED_SOURCE_ID = 'leader-trail-passed';
export const PASSED_LAYER_ID = 'leader-trail-passed-line';
export const PASSED_WIDTH = 5;
export const PASSED_OPACITY = 0.6;

/** GeoJSON for a polyline; an empty collection (not null) when there is no line, so sources never remount. */
export function lineData(points: readonly { lat: number; lng: number }[]): GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection {
  return points.length >= 2
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } }
    : { type: 'FeatureCollection', features: [] };
}

export interface StyleLayerLike {
  id: string;
  type: string;
  'source-layer'?: string;
}

/**
 * Id of the layer the route goes below (16 §2.5): the first symbol (label) layer that comes after the
 * last road/building layer, so roads never paint over the route and labels stay readable on top.
 * "First symbol layer" is wrong for OpenFreeMap `dark`: its first symbol sits under the roads.
 */
export function routeBeforeId(layers: readonly StyleLayerLike[]): string | undefined {
  let lastRoad = -1;
  layers.forEach((l, i) => {
    const src = l['source-layer'];
    if ((src === 'transportation' || src === 'building') && (l.type === 'line' || l.type === 'fill')) lastRoad = i;
  });
  return layers.find((l, i) => i > lastRoad && l.type === 'symbol')?.id;
}

/** Route to the shared next stop (19 A): 6 dp line, casing 1.5 dp wider on each side, always. */
export const NAV_ROUTE_WIDTH = 6;
export const NAV_CASING_WIDTH = 9;
export const NAV_ROUTE_SOURCE_ID = 'nav-route';
/** Dashed straight-line fallback while there is no road route (dash lengths in line widths). */
export const NAV_DASH: [number, number] = [2, 1.5];
