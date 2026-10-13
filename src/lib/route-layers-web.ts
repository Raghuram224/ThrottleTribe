// maplibre-gl helpers for the route highlight, shared by the Live and Summary web maps.
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';

import {
  CASING_WIDTH,
  NAV_CASING_WIDTH,
  NAV_DASH,
  NAV_ROUTE_SOURCE_ID,
  NAV_ROUTE_WIDTH,
  PASSED_LAYER_ID,
  PASSED_OPACITY,
  PASSED_SOURCE_ID,
  PASSED_WIDTH,
  ROUTE_WIDTH,
  routeBeforeId,
  type StyleLayerLike,
} from '@/lib/route-style';

export const ROUTE_SOURCE = 'leader-trail';
export const ROUTE_CASING_LAYER = 'leader-trail-casing';
export const ROUTE_LINE_LAYER = 'leader-trail-line';

/**
 * Adds or updates the casing + line layers for `data` (null removes them). Safe to call on every
 * style.load: layers are inserted before the first label layer after the last road, casing first.
 */
export function syncRouteLayers(
  m: MlMap,
  data: GeoJSON.Feature<GeoJSON.LineString> | null,
  colors: { routeLine: string; routeCasing: string },
): void {
  if (!m.isStyleLoaded()) return;
  const source = m.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!data) {
    for (const id of [ROUTE_LINE_LAYER, ROUTE_CASING_LAYER]) if (m.getLayer(id)) m.removeLayer(id);
    if (source) m.removeSource(ROUTE_SOURCE);
    return;
  }
  if (source) {
    source.setData(data);
    // A palette change on the same basemap: recolour in place.
    if (m.getLayer(ROUTE_CASING_LAYER)) m.setPaintProperty(ROUTE_CASING_LAYER, 'line-color', colors.routeCasing);
    if (m.getLayer(ROUTE_LINE_LAYER)) m.setPaintProperty(ROUTE_LINE_LAYER, 'line-color', colors.routeLine);
    return;
  }
  const before = routeBeforeId((m.getStyle().layers ?? []) as unknown as StyleLayerLike[]);
  m.addSource(ROUTE_SOURCE, { type: 'geojson', data });
  m.addLayer(
    {
      id: ROUTE_CASING_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.routeCasing, 'line-width': CASING_WIDTH, 'line-opacity': 1 },
    },
    before,
  );
  m.addLayer(
    {
      id: ROUTE_LINE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.routeLine, 'line-width': ROUTE_WIDTH, 'line-opacity': 1 },
    },
    before,
  );
}

export const NAV_CASING_LAYER = 'nav-route-casing';
export const NAV_LINE_LAYER = 'nav-route-line';

/**
 * My route to the shared stop (19 A): same insertion point as the leader trail, but always moved
 * above it, so it draws over the trail and under the (DOM) markers. `data` null removes it; `dashed`
 * is the straight-line fallback (no casing). Safe to call on every style.load.
 */
export function syncNavRouteLayers(
  m: MlMap,
  data: GeoJSON.Feature<GeoJSON.LineString> | null,
  dashed: boolean,
  colors: { navRoute: string; navRouteCasing: string },
): void {
  if (!m.isStyleLoaded()) return;
  const source = m.getSource(NAV_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  if (!data) {
    for (const id of [NAV_LINE_LAYER, NAV_CASING_LAYER]) if (m.getLayer(id)) m.removeLayer(id);
    if (source) m.removeSource(NAV_ROUTE_SOURCE_ID);
    return;
  }
  const before = routeBeforeId((m.getStyle().layers ?? []) as unknown as StyleLayerLike[]);
  if (source) source.setData(data);
  else m.addSource(NAV_ROUTE_SOURCE_ID, { type: 'geojson', data });
  // Solid and dashed differ in casing, cap and dash: rebuild the two layers (cheap, route changes rarely).
  for (const id of [NAV_LINE_LAYER, NAV_CASING_LAYER]) if (m.getLayer(id)) m.removeLayer(id);
  if (!dashed) {
    m.addLayer(
      {
        id: NAV_CASING_LAYER,
        type: 'line',
        source: NAV_ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.navRouteCasing, 'line-width': NAV_CASING_WIDTH, 'line-opacity': 1 },
      },
      before,
    );
  }
  m.addLayer(
    {
      id: NAV_LINE_LAYER,
      type: 'line',
      source: NAV_ROUTE_SOURCE_ID,
      layout: { 'line-cap': dashed ? 'butt' : 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.navRoute,
        'line-width': NAV_ROUTE_WIDTH,
        'line-opacity': 1,
        ...(dashed ? { 'line-dasharray': NAV_DASH } : {}),
      },
    },
    before,
  );
}

type LineData = GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection;

/**
 * Live map leader trail: faded crossed part under the bright part still ahead (casing + line).
 * Sources and layers are created once (empty data is fine) and then only updated, so the layer
 * order stays passed < ahead, and the nav route (synced after this) stays on top. Safe on every style.load.
 */
export function syncLeaderTrailLayers(
  m: MlMap,
  data: { passed: LineData; ahead: LineData },
  colors: { routeLine: string; routeCasing: string; trailPassed: string },
): void {
  if (!m.isStyleLoaded()) return;
  const passed = m.getSource(PASSED_SOURCE_ID) as GeoJSONSource | undefined;
  const ahead = m.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (passed && ahead) {
    passed.setData(data.passed);
    ahead.setData(data.ahead);
    // A palette change on the same basemap: recolour in place.
    m.setPaintProperty(PASSED_LAYER_ID, 'line-color', colors.trailPassed);
    m.setPaintProperty(ROUTE_CASING_LAYER, 'line-color', colors.routeCasing);
    m.setPaintProperty(ROUTE_LINE_LAYER, 'line-color', colors.routeLine);
    return;
  }
  const before = routeBeforeId((m.getStyle().layers ?? []) as unknown as StyleLayerLike[]);
  m.addSource(PASSED_SOURCE_ID, { type: 'geojson', data: data.passed });
  m.addSource(ROUTE_SOURCE, { type: 'geojson', data: data.ahead });
  m.addLayer(
    {
      id: PASSED_LAYER_ID,
      type: 'line',
      source: PASSED_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.trailPassed, 'line-width': PASSED_WIDTH, 'line-opacity': PASSED_OPACITY },
    },
    before,
  );
  m.addLayer(
    {
      id: ROUTE_CASING_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.routeCasing, 'line-width': CASING_WIDTH, 'line-opacity': 1 },
    },
    before,
  );
  m.addLayer(
    {
      id: ROUTE_LINE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.routeLine, 'line-width': ROUTE_WIDTH, 'line-opacity': 1 },
    },
    before,
  );
}
