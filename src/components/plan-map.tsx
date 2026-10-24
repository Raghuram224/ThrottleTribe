import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapLibreMap } from '@/components/map/maplibre-map';
import { PlanLayers, usePlanLines, type MapPin, type RouteLabelView } from '@/components/map/plan-layers';
import type { MapHandle } from '@/components/map/types';
import { usePlanCamera } from '@/hooks/use-plan-camera';
import type { LatLng } from '@/lib/geo';
import type { CameraIntent, PlanCamera } from '@/lib/plan-flow';
import type { PlaceCategory } from '@/lib/place-search';
import type { PreviewPadding } from '@/lib/preview-fit';
import type { StopKind } from '@/lib/ride-api';
import type { MapRouteView } from '@/lib/route-choices';

export type { MapPin, RouteLabelView } from '@/components/map/plan-layers';

export interface PlanMapProps {
  me: { lat: number; lng: number; accuracyM: number | null } | null;
  /** The pin: the place sheet and the route (null in browse). */
  place: { lat: number; lng: number; kind: StopKind; category: PlaceCategory } | null;
  /**
   * Every road route of the preview, the chosen one last (drawn on top): grey with a casing for the others, the route
   * colour for the chosen one. Empty while loading and on failure: the preview never draws a straight line (28).
   */
  routes: readonly MapRouteView[];
  /** A tap on a grey route line or its duration pill chooses that route. */
  onSelectRoute?: (index: number) => void;
  routeLabels?: readonly RouteLabelView[];
  /** The routes are the previous ones while new ones load: drawn at 0.4 opacity (21 §2.3 "Updating"). */
  faded?: boolean;
  /** Search results as category pins (search mode, 28). */
  pins?: readonly MapPin[];
  onPinPress?: (id: string) => void;
  /** What a 'fit' intent frames: every route, or every search result (a pure helper in lib/preview-fit decides). */
  fitPoints: readonly LatLng[];
  /** Everything floating over the map is counted here (the 20 C2 rule): bar, chips, sheet or panel, attribution. */
  padding: PreviewPadding;
  intent: CameraIntent;
  intentNonce: number;
  /** The first frame, no animation. */
  initial: PlanCamera;
  /** No fix, no saved camera, no touch yet: frame India in the map the sheet leaves visible (22 §4.2, audit 4). */
  frameFallback?: boolean;
  /** Browse: the camera follows each fix (22 §4.2 "Centred"). */
  follow: boolean;
  /** The rider's own touch moved the camera (programmatic eases report `userInteraction: false`). */
  onUserGesture: () => void;
  /** The camera came to rest: Home persists it (browse only, throttled there). */
  onIdle: (camera: PlanCamera) => void;
  /** Style or tiles failed to load (22 §4.4). */
  onMapError: () => void;
  /** A tap on the map itself: Home collapses an expanded sheet. */
  onMapPress?: () => void;
}

/**
 * The map home's planning map (22 §2.2): `MapLibreMap` with the plan layers (pin, result pins, route labels, me) and the
 * browse camera (`usePlanCamera`: follow / free, saved camera, intents). North-up, pan and zoom allowed, no rotate or
 * pitch. Same route, casing, pin and "me" marker as the live map, so a destination looks the same on Home, the preview and
 * live. Home itself composes these pieces in `HomeMap`, next to the ride view's scene, on one map.
 */
export function PlanMap({
  me,
  place,
  routes,
  onSelectRoute,
  routeLabels = [],
  faded = false,
  pins = [],
  onPinPress,
  fitPoints,
  padding,
  intent,
  intentNonce,
  initial,
  frameFallback = false,
  follow,
  onUserGesture,
  onIdle,
  onMapError,
  onMapPress,
}: PlanMapProps) {
  const mapRef = useRef<MapHandle>(null);
  const zoomRef = useRef(initial.zoom);
  // The first frame only: later changes to `initial` are ignored on purpose (the camera moves by intents).
  const [initialCamera] = useState(() => ({ center: [initial.lng, initial.lat] as [number, number], zoom: initial.zoom }));

  usePlanCamera({
    mapRef,
    me,
    place,
    fitPoints,
    padding,
    intent,
    intentNonce,
    frameFallback,
    follow,
    getZoom: () => zoomRef.current,
  });
  const lines = usePlanLines({ routes, onSelectRoute, faded });

  return (
    <View style={styles.root}>
      <MapLibreMap
        ref={mapRef}
        initialCamera={initialCamera}
        lines={lines}
        onPress={onMapPress}
        onGesture={onUserGesture}
        onError={onMapError}
        onIdle={({ center, zoom }) => {
          zoomRef.current = zoom;
          onIdle({ lat: center[1], lng: center[0], zoom });
        }}>
        <PlanLayers me={me} place={place} routeLabels={routeLabels} onSelectRoute={onSelectRoute} pins={pins} onPinPress={onPinPress} />
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
