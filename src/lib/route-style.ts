// Route highlight geometry shared by every map (16 §2.5): Live and Summary, native and web.
// Zoom-scaled widths; the casing is always ~1.5 dp wider on each side than the line.
export type ZoomWidth = ['interpolate', ['linear'], ['zoom'], ...number[]];

// The casing must be wider than any Liberty road casing at every zoom from 10 to 19 (24 §1.4), so a road edge never peeks
// out beside the route: hence the z19 stop (the roads keep growing after z17, the route used to stop).
export const ROUTE_WIDTH: ZoomWidth = ['interpolate', ['linear'], ['zoom'], 8, 4, 11, 5, 13, 6.5, 15, 8.5, 17, 11, 19, 14];
export const CASING_WIDTH: ZoomWidth = ['interpolate', ['linear'], ['zoom'], 8, 7, 11, 8, 13, 9.5, 15, 12, 17, 15, 19, 19.5];
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
 * Id of the layer the route goes below (24 §1.3): the first symbol layer of road names (`transportation_name`) or
 * places (`place`) after the last road/building line or fill, so the route sits above roads, buildings, boundaries,
 * water labels and POI icons, and below road names and place names. Falls back to the first symbol after the last
 * road (16 §2.5) when the style has no such layer.
 * "First symbol layer" is wrong for OpenFreeMap `dark`: its first symbol sits under the roads.
 */
export function routeBeforeId(layers: readonly StyleLayerLike[]): string | undefined {
  let lastRoad = -1;
  layers.forEach((l, i) => {
    const src = l['source-layer'];
    if ((src === 'transportation' || src === 'building') && (l.type === 'line' || l.type === 'fill')) lastRoad = i;
  });
  const after = layers.filter((_, i) => i > lastRoad);
  const labelled = after.find((l) => l.type === 'symbol' && (l['source-layer'] === 'transportation_name' || l['source-layer'] === 'place'));
  return (labelled ?? after.find((l) => l.type === 'symbol'))?.id;
}

/** Route to the shared next stop (19 A): 6 dp line, casing 1.5 dp wider on each side, always. */
// Zoom-scaled, 0.5 to 1 dp inside the trail so the trail's edge still shows where both run (24 §1.4). Same in all palettes.
export const NAV_ROUTE_WIDTH: ZoomWidth = ['interpolate', ['linear'], ['zoom'], 8, 4, 11, 5, 13, 6, 15, 7.5, 17, 10, 19, 13];
export const NAV_CASING_WIDTH: ZoomWidth = ['interpolate', ['linear'], ['zoom'], 8, 6.5, 11, 7.5, 13, 9, 15, 11.5, 17, 14.5, 19, 18.5];
export const NAV_ROUTE_SOURCE_ID = 'nav-route';
/** Dashed straight-line fallback while there is no road route (dash lengths in line widths). */
export const NAV_DASH: [number, number] = [2, 1.5];
