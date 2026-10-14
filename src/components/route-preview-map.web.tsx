// Web route preview map: maplibre-gl, same props as route-preview-map.tsx (MapLibre RN has no web build).
import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MeMarker } from '@/components/me-marker';
import { MapMarker } from '@/components/ride-map.web';
import type { RoutePreviewMapProps } from '@/components/route-preview-map';
import { StopPin } from '@/components/stop-pin';
import { fitBoundsFor } from '@/lib/map-fit';
import { previewFitPoints } from '@/lib/preview-fit';
import { lineData } from '@/lib/route-style';
import { syncNavRouteLayers } from '@/lib/route-layers-web';
import { useTheme } from '@/theme/use-theme';

export type { RoutePreviewMapProps };

const FIT_MS = 400;
const DEST_ONLY_ZOOM = 14;

export function RoutePreviewMap({ line, me, dest, padding }: RoutePreviewMapProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const styleUrl = useRef(colors.mapStyle);
  const points = useMemo(() => previewFitPoints(line, me, dest), [line, me, dest]);
  const bounds = useMemo(() => fitBoundsFor(points), [points]);
  const dashed = line?.dashed ?? false;
  const geo = useMemo(
    () => (line && line.coords.length >= 2 ? (lineData(line.coords) as GeoJSON.Feature<GeoJSON.LineString>) : null),
    [line],
  );
  const layerRef = useRef({ geo, dashed });

  const sync = (m: MlMap) =>
    syncNavRouteLayers(m, layerRef.current.geo, layerRef.current.dashed, {
      navRoute: colors.navRoute,
      navRouteCasing: colors.navRouteCasing,
    });
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const m = new maplibregl.Map({
      container,
      style: styleUrl.current,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      center: [dest.lng, dest.lat],
      zoom: DEST_ONLY_ZOOM,
    });
    m.touchZoomRotate.disableRotation();
    m.touchPitch.disable();
    m.on('style.load', () => syncRef.current(m));
    m.on('load', () => syncRef.current(m));
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
    // The destination only seeds the first frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map || styleUrl.current === colors.mapStyle) return;
    styleUrl.current = colors.mapStyle;
    map.setStyle(colors.mapStyle);
  }, [map, colors.mapStyle]);

  useEffect(() => {
    layerRef.current = { geo, dashed };
    if (map) syncRef.current(map);
  }, [map, geo, dashed]);

  const fitKey = bounds ? `${bounds.map((b) => b.toFixed(4)).join(',')}|${padding.top}|${padding.bottom}` : '';
  useEffect(() => {
    if (!map || !bounds) return;
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding, duration: FIT_MS, bearing: 0, pitch: 0 },
    );
    // fitKey stands for bounds + padding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <div ref={containerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {map ? (
        <>
          <MapMarker map={map} lat={dest.lat} lng={dest.lng} zIndex={2} anchor="bottom">
            <StopPin kind={dest.kind} />
          </MapMarker>
          {me ? (
            <MapMarker map={map} lat={me.lat} lng={me.lng} zIndex={3}>
              <MeMarker variant="map" heading={null} lat={me.lat} zoom={14} />
            </MapMarker>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
