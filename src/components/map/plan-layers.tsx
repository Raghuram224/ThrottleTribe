import { GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MapLine } from '@/components/map/types';
import { MeMarker } from '@/components/me-marker';
import { RouteLabel } from '@/components/route-label';
import { StopPin } from '@/components/stop-pin';
import type { PlaceCategory } from '@/lib/place-search';
import type { StopKind } from '@/lib/ride-api';
import type { MapRouteView } from '@/lib/route-choices';
import { NAV_CASING_WIDTH, NAV_ROUTE_WIDTH } from '@/lib/route-style';
import { useTheme } from '@/theme/use-theme';

/** A search result on the map: the category pin of the place (28). */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
}

/** The duration pill on a route line: where it sits, its words, and whether its route is the chosen one. */
export interface RouteLabelView {
  index: number;
  lat: number;
  lng: number;
  text: string;
  selected: boolean;
}

export interface PlanLinesArgs {
  /**
   * Every road route of the preview, the chosen one last (drawn on top): grey with a casing for the others, the route
   * colour for the chosen one. Empty while loading and on failure: the preview never draws a straight line (28).
   */
  routes: readonly MapRouteView[];
  /** A tap on a grey route line or its duration pill chooses that route. */
  onSelectRoute?: (index: number) => void;
  /** The routes are the previous ones while new ones load: drawn at 0.4 opacity (21 §2.3 "Updating"). */
  faded: boolean;
}

/**
 * The preview's route lines as `MapLibreMap` data (it draws them as sources `nav-route-<i>`, the plan scene's own ids, so
 * they never share a source with the ride scene's `nav-route`).
 */
export function usePlanLines({ routes, onSelectRoute, faded }: PlanLinesArgs): MapLine[] {
  const { colors } = useTheme();
  const opacity = faded ? 0.4 : 1;
  return useMemo<MapLine[]>(
    () =>
      routes.map((r) => ({
        id: `nav-route-${r.index}`,
        coords: r.coords,
        beforeId: colors.routeBeforeId,
        // The chosen route: the route colour on its casing. The others: grey on a surface-coloured casing, so they read as
        // "another way" and stay visible on every map style. Both have a casing; neither is dashed.
        layers: r.selected
          ? [
              { color: colors.navRouteCasing, width: NAV_CASING_WIDTH, opacity },
              { color: colors.navRoute, width: NAV_ROUTE_WIDTH, opacity },
            ]
          : [
              { color: colors.surfaceRaised, width: NAV_CASING_WIDTH, opacity },
              { color: colors.trailPassed, width: NAV_ROUTE_WIDTH, opacity },
            ],
        // A route that becomes the chosen one is re-added, so it is drawn above the ones already on the map.
        stack: r.selected ? 'on' : 'off',
        onPress: r.selected || !onSelectRoute ? undefined : () => onSelectRoute(r.index),
      })),
    [routes, opacity, onSelectRoute, colors.navRoute, colors.navRouteCasing, colors.trailPassed, colors.surfaceRaised, colors.routeBeforeId],
  );
}

export interface PlanLayersProps {
  me: { lat: number; lng: number; accuracyM: number | null } | null;
  /** The pin: the place sheet and the route (null in browse). */
  place: { lat: number; lng: number; kind: StopKind; category: PlaceCategory } | null;
  routeLabels?: readonly RouteLabelView[];
  onSelectRoute?: (index: number) => void;
  /** Search results as category pins (search mode, 28). */
  pins?: readonly MapPin[];
  onPinPress?: (id: string) => void;
}

/** One point where the pin's tip is, as GeoJSON for the label-collision symbol. */
function stopBox(p: { lat: number; lng: number }): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } };
}

/**
 * The map home's planning scene inside a MapLibre `Map` (22, 28): the place pin with its label-collision box, search
 * result pins, the route duration pills and my dot. The route lines come through `usePlanLines` -> `MapLibreMap.lines`.
 */
export function PlanLayers({ me, place, routeLabels = [], onSelectRoute, pins = [], onPinPress }: PlanLayersProps) {
  const { scheme, style } = useTheme();
  const boxData = useMemo(() => (place ? stopBox(place) : null), [place]);
  return (
    <>
      {place && boxData ? (
        // The pin is a native view, so basemap labels cannot see it and the place's own name (the town) ended up under it.
        // This invisible symbol, on top of the style so it is placed first, takes the pin's box in the label collision
        // pass: any label that would touch the pin is dropped instead. Sprite `circle_11` at 4x is about the pin's 44 dp.
        <GeoJSONSource key={`plan-stop-box-${style}-${scheme}`} id="plan-stop-box" data={boxData}>
          <Layer
            id="plan-stop-box"
            type="symbol"
            layout={{ 'icon-image': 'circle_11', 'icon-size': 4, 'icon-anchor': 'bottom', 'icon-allow-overlap': false, 'icon-ignore-placement': false }}
            paint={{ 'icon-opacity': 0 }}
          />
        </GeoJSONSource>
      ) : null}
      {pins.map((p) => (
        <Marker key={p.id} id={`plan-pin-${p.id}`} lngLat={[p.lng, p.lat]} anchor="bottom" onPress={onPinPress ? () => onPinPress(p.id) : undefined}>
          {/* 36 x 44 pin padded to a 48 dp target; symmetric sideways and only above, so the tip stays the anchor. */}
          <View style={styles.pinHit}>
            <StopPin kind="break" category={p.category} generic />
          </View>
        </Marker>
      ))}
      {routeLabels.map((l) => (
        <Marker
          key={`route-label-${l.index}`}
          id={`route-label-${l.index}`}
          lngLat={[l.lng, l.lat]}
          onPress={onSelectRoute ? () => onSelectRoute(l.index) : undefined}>
          <RouteLabel text={l.text} selected={l.selected} />
        </Marker>
      ))}
      {place ? (
        <Marker id="plan-stop" lngLat={[place.lng, place.lat]} anchor="bottom">
          <StopPin kind={place.kind} category={place.category} />
        </Marker>
      ) : null}
      {me ? (
        <Marker id="plan-me" lngLat={[me.lng, me.lat]}>
          <MeMarker variant="map" heading={null} accuracyM={me.accuracyM} lat={me.lat} zoom={15} />
        </Marker>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pinHit: { paddingHorizontal: 6, paddingTop: 4 },
});
