import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type InitialViewState,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import { TerrainLayer } from '@/components/map/terrain-layer';
import type { MapHandle, MapLibreMapProps } from '@/components/map/types';
import type { Bounds } from '@/lib/map-fit';
import { copy } from '@/lib/copy';
import { mapStyleJsonFor } from '@/lib/map-styles';
import { lineData, NAV_DASH } from '@/lib/route-style';
import { useTheme } from '@/theme/use-theme';

/** The OpenFreeMap / MapLibre map for Home, the route preview and the ride summary: data-driven lines, imperative camera. */
export function MapLibreMap({
  initialCamera,
  interactive = true,
  lines,
  onPress,
  onGesture,
  onIdle,
  onError,
  ref,
  children,
}: MapLibreMapProps) {
  const { colors, scheme, style } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const last = useRef<{ zoom: number | null; bounds: Bounds | null }>({ zoom: null, bounds: null });
  // The first frame only: later changes to `initialCamera` are ignored on purpose (the camera moves by calls).
  const [initialView] = useState<InitialViewState>(() =>
    'bounds' in initialCamera
      ? { bounds: initialCamera.bounds, padding: initialCamera.padding }
      : { center: initialCamera.center, zoom: initialCamera.zoom },
  );

  useImperativeHandle(
    ref,
    (): MapHandle => ({
      easeTo: ({ center, zoom, bearing, pitch, padding, durationMs, linear }) =>
        cameraRef.current?.easeTo({ center, zoom, bearing, pitch, padding, duration: durationMs, easing: linear ? 'linear' : 'ease' }),
      fitBounds: (bounds, { padding, durationMs }) =>
        cameraRef.current?.fitBounds(bounds, { padding, duration: durationMs, bearing: 0, pitch: 0 }),
      getZoom: () => last.current.zoom,
      getBounds: () => last.current.bounds,
    }),
    [],
  );

  const onRegionChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    // Programmatic eases report userInteraction false.
    if (e.nativeEvent.userInteraction) onGesture?.();
  };
  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { center, zoom, bounds } = e.nativeEvent;
    last.current = { zoom, bounds };
    onRegionChange(e);
    onIdle?.({ center: [center[0], center[1]], zoom });
  };

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Map
        accessibilityLabel={copy['map.a11y']}
        mapStyle={mapStyleJsonFor(colors.mapStyle)}
        compass={false}
        dragPan={interactive}
        touchZoom={interactive}
        touchRotate={false}
        touchPitch={false}
        scaleBar={false}
        logo={false}
        attribution={false}
        onPress={onPress}
        onDidFailLoadingMap={onError}
        onRegionWillChange={onRegionChange}
        onRegionIsChanging={onRegionChange}
        onRegionDidChange={onRegionDidChange}>
        <Camera ref={cameraRef} initialViewState={initialView} />
        <TerrainLayer />
        {lines.map((line) => (
          // Keyed by style and scheme: a switch re-adds the layers below the new style's labels.
          <GeoJSONSource key={`${line.id}-${style}-${scheme}`} id={line.id} data={lineData(line.coords)}>
            {line.layers.map((layer, i) => {
              const top = i === line.layers.length - 1;
              const dashed = !!line.dashed && top;
              return (
                <Layer
                  key={`${i}-${dashed ? 'dashed' : 'solid'}`}
                  id={`${line.id}-${i}`}
                  type="line"
                  beforeId={line.beforeId}
                  layout={{ 'line-cap': dashed ? 'butt' : 'round', 'line-join': 'round' }}
                  paint={{
                    'line-width': layer.width,
                    'line-color': layer.color,
                    'line-opacity': layer.opacity ?? 1,
                    ...(dashed ? { 'line-dasharray': NAV_DASH } : {}),
                  }}
                />
              );
            })}
          </GeoJSONSource>
        ))}
        {children}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
