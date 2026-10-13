// Web summary map: maplibre-gl, non-interactive, same props and look as summary-route-map.tsx.
import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RoutePin } from '@/components/route-pin';
import { MapMarker } from '@/components/ride-map.web';
import { copy } from '@/lib/copy';
import type { LatLng } from '@/lib/geo';
import { fitBoundsFor } from '@/lib/map-fit';
import { syncRouteLayers } from '@/lib/route-layers-web';
import { family, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PADDING = { top: 70, right: 70, bottom: 56, left: 70 };
const FIT_MIN_SPAN_M = 400;

interface SummaryRouteMapProps {
  points: LatLng[];
  fitNonce: number;
}

export function SummaryRouteMap({ points, fitNonce }: SummaryRouteMapProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const styleUrl = useRef(colors.mapStyle);
  const bounds = useMemo(() => fitBoundsFor(points, FIT_MIN_SPAN_M), [points]);
  const geo = useMemo(
    () =>
      ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
      }) as GeoJSON.Feature<GeoJSON.LineString>,
    [points],
  );
  const geoRef = useRef(geo);
  const sync = useCallback(
    (m: MlMap) => syncRouteLayers(m, geoRef.current, { routeLine: colors.routeLine, routeCasing: colors.routeCasing }),
    [colors.routeLine, colors.routeCasing],
  );
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
    geoRef.current = geo;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const m = new maplibregl.Map({
      container,
      style: styleUrl.current,
      attributionControl: false,
      interactive: false,
      ...(bounds
        ? { bounds: [[bounds[0], bounds[1]], [bounds[2], bounds[3]]] as [[number, number], [number, number]], fitBoundsOptions: { padding: PADDING, animate: false } }
        : { center: [0, 20] as [number, number], zoom: 2 }),
    });
    m.on('style.load', () => syncRef.current(m));
    m.on('load', () => syncRef.current(m));
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
    // Created once; the camera is fitted by the options above and by the re-fit effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map || styleUrl.current === colors.mapStyle) return;
    styleUrl.current = colors.mapStyle;
    map.setStyle(colors.mapStyle);
  }, [map, colors.mapStyle]);

  useEffect(() => {
    if (map) sync(map);
  }, [map, geo, sync]);

  useEffect(() => {
    if (fitNonce > 0 && map && bounds) {
      map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: PADDING, duration: 300 });
    }
  }, [fitNonce, map, bounds]);

  const start = points[0];
  const end = points[points.length - 1];
  return (
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={copy['summary.a11yRouteMap']}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {map ? (
        <>
          <MapMarker map={map} lat={start.lat} lng={start.lng} zIndex={1}>
            <RoutePin kind="start" />
          </MapMarker>
          <MapMarker map={map} lat={end.lat} lng={end.lng} zIndex={2}>
            <RoutePin kind="end" />
          </MapMarker>
        </>
      ) : null}
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
