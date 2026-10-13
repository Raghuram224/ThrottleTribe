import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RoutePin } from '@/components/route-pin';
import { copy } from '@/lib/copy';
import type { LatLng } from '@/lib/geo';
import { fitBoundsFor } from '@/lib/map-fit';
import { CASING_WIDTH, ROUTE_WIDTH } from '@/lib/route-style';
import { family, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Camera padding (16 §4): room for the status bar buttons above and the sheet overlap below. */
export const SUMMARY_FIT_PADDING = { top: 70, right: 70, bottom: 56, left: 70 } as const;
const FIT_MIN_SPAN_M = 400;

interface SummaryRouteMapProps {
  /** My cleaned samples, oldest first (at least two). */
  points: LatLng[];
  /** Increment to re-fit the route (the fit button). */
  fitNonce: number;
}

/**
 * Non-interactive route map for the ride summary (16 §4): my trail with the route highlight (casing +
 * line, below the labels), start and finish pins, camera fitted to the route, attribution bottom-left.
 */
export function SummaryRouteMap({ points, fitNonce }: SummaryRouteMapProps) {
  const { colors, scheme, style } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const bounds = useMemo(() => fitBoundsFor(points, FIT_MIN_SPAN_M), [points]);
  const [initial] = useState(() => (bounds ? { bounds, padding: SUMMARY_FIT_PADDING } : { center: [0, 20] as [number, number], zoom: 2 }));
  const geo = useMemo(
    () =>
      ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
      }) as GeoJSON.Feature<GeoJSON.LineString>,
    [points],
  );
  const start = points[0];
  const end = points[points.length - 1];

  useEffect(() => {
    if (fitNonce > 0 && bounds) cameraRef.current?.fitBounds(bounds, { padding: SUMMARY_FIT_PADDING, duration: 300 });
  }, [fitNonce, bounds]);

  return (
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={copy['summary.a11yRouteMap']}>
      <Map
        mapStyle={colors.mapStyle}
        compass={false}
        dragPan={false}
        touchZoom={false}
        touchRotate={false}
        touchPitch={false}
        scaleBar={false}
        logo={false}
        attribution={false}>
        <Camera ref={cameraRef} initialViewState={initial} />
        <GeoJSONSource key={`${style}-${scheme}`} id="summary-route" data={geo}>
          <Layer
            id="summary-route-casing"
            type="line"
            beforeId={colors.routeBeforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-width': CASING_WIDTH, 'line-color': colors.routeCasing, 'line-opacity': 1 }}
          />
          <Layer
            id="summary-route-line"
            type="line"
            beforeId={colors.routeBeforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-width': ROUTE_WIDTH, 'line-color': colors.routeLine, 'line-opacity': 1 }}
          />
        </GeoJSONSource>
        <Marker id="summary-start" lngLat={[start.lng, start.lat]}>
          <RoutePin kind="start" />
        </Marker>
        <Marker id="summary-end" lngLat={[end.lng, end.lat]}>
          <RoutePin kind="end" />
        </Marker>
      </Map>
      <View pointerEvents="none" style={styles.attribution}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.attributionText, { color: colors.textMuted }]}>
          {copy['live.attribution']}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  attribution: { position: 'absolute', left: space.sm, bottom: 30 },
  attributionText: { fontSize: 10, lineHeight: 14, fontFamily: family.regular },
});
