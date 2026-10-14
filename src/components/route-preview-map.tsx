import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type InitialViewState } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MeMarker } from '@/components/me-marker';
import { navRouteLayerProps } from '@/components/route-layers';
import { StopPin } from '@/components/stop-pin';
import type { LatLng } from '@/lib/geo';
import { fitBoundsFor, type Bounds } from '@/lib/map-fit';
import { previewFitPoints, type PreviewPadding } from '@/lib/preview-fit';
import { lineData, NAV_ROUTE_SOURCE_ID } from '@/lib/route-style';
import type { NavLine } from '@/lib/stop-ui';
import type { StopKind } from '@/lib/ride-api';
import { useTheme } from '@/theme/use-theme';

export interface RoutePreviewMapProps {
  /** The road route (solid), the dashed straight line, or nothing yet. */
  line: NavLine | null;
  me: LatLng | null;
  dest: { lat: number; lng: number; kind: StopKind };
  /** The line is the previous route while a new one loads: drawn at 0.4 opacity (21 §2.3 "Updating"). */
  faded?: boolean;
  /** Everything floating over the map is counted here (21 §2.3): back button, panel, attribution. */
  padding: PreviewPadding;
}

const FIT_MS = 400;
/** Without a start point the destination shows at street level (zoom 14). */
const DEST_ONLY_ZOOM = 14;

/**
 * Preview map (21 §2.3): north-up, pan and zoom allowed, fitted to the route with the padding of what floats
 * over it. Draws the same route and casing as the live map (`navRouteLayerProps`), my dot and the stop pin.
 */
export function RoutePreviewMap({ line, me, dest, padding, faded = false }: RoutePreviewMapProps) {
  const { colors, scheme, style } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const points = useMemo(() => previewFitPoints(line, me, dest), [line, me, dest]);
  const bounds = useMemo<Bounds | null>(() => fitBoundsFor(points), [points]);

  const [initial] = useState<InitialViewState>(() =>
    bounds ? { bounds, padding } : { center: [dest.lng, dest.lat], zoom: DEST_ONLY_ZOOM },
  );

  // Refit when the thing to frame or the room around it changes (not on every GPS tick: `me` only matters
  // before there is a route, and the points then change once).
  const fitKey = bounds ? `${bounds.map((b) => b.toFixed(4)).join(',')}|${padding.top}|${padding.bottom}|${padding.left}` : '';
  useEffect(() => {
    if (!bounds) return;
    cameraRef.current?.fitBounds(bounds, { padding, duration: FIT_MS, bearing: 0, pitch: 0 });
    // fitKey stands for bounds + padding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const geo = useMemo(() => lineData(line?.coords ?? []), [line]);
  const dashed = line?.dashed ?? false;
  const layers = navRouteLayerProps(colors, dashed, faded ? 0.4 : 1);

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Map
        mapStyle={colors.mapStyle}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        scaleBar={false}
        logo={false}
        attribution={false}>
        <Camera ref={cameraRef} initialViewState={initial} />
        <GeoJSONSource key={`nav-${style}-${scheme}`} id={NAV_ROUTE_SOURCE_ID} data={geo}>
          {line && !dashed ? <Layer id="nav-route-casing" type="line" beforeId={colors.routeBeforeId} {...layers.casing} /> : null}
          <Layer key={dashed ? 'dashed' : 'solid'} id="nav-route-line" type="line" beforeId={colors.routeBeforeId} {...layers.line} />
        </GeoJSONSource>
        <Marker id="preview-stop" lngLat={[dest.lng, dest.lat]} anchor="bottom">
          <StopPin kind={dest.kind} />
        </Marker>
        {me ? (
          <Marker id="preview-me" lngLat={[me.lng, me.lat]}>
            <MeMarker variant="map" heading={null} lat={me.lat} zoom={14} />
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
