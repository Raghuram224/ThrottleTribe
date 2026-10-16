import { Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MapLibreMap } from '@/components/map/maplibre-map';
import type { MapHandle, MapLine } from '@/components/map/types';
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
  const { colors } = useTheme();
  const mapRef = useRef<MapHandle>(null);
  const bounds = useMemo(() => fitBoundsFor(points, FIT_MIN_SPAN_M), [points]);
  const initialCamera = useMemo(
    () => (bounds ? { bounds, padding: SUMMARY_FIT_PADDING } : { center: [0, 20] as [number, number], zoom: 2 }),
    // The first frame only: the map ignores later changes; the fit button re-fits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const lines = useMemo<MapLine[]>(() => {
    return [
      {
        id: 'summary-route',
        coords: points,
        beforeId: colors.routeBeforeId,
        layers: [
          { color: colors.routeCasing, width: CASING_WIDTH },
          { color: colors.routeLine, width: ROUTE_WIDTH },
        ],
      },
    ];
  }, [points, colors]);
  const start = points[0];
  const end = points[points.length - 1];

  useEffect(() => {
    if (fitNonce > 0 && bounds) mapRef.current?.fitBounds(bounds, { padding: SUMMARY_FIT_PADDING, durationMs: 300 });
  }, [fitNonce, bounds]);

  return (
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={copy['summary.a11yRouteMap']}>
      <MapLibreMap ref={mapRef} initialCamera={initialCamera} interactive={false} lines={lines}>
        <Marker id="summary-start" lngLat={[start.lng, start.lat]}>
          <RoutePin kind="start" />
        </Marker>
        <Marker id="summary-end" lngLat={[end.lng, end.lat]}>
          <RoutePin kind="end" />
        </Marker>
      </MapLibreMap>
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
