import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapLibreMap } from '@/components/map/maplibre-map';
import { PlanLayers, usePlanLines } from '@/components/map/plan-layers';
import { RideLayers } from '@/components/map/ride-layers';
import type { MapHandle, MapInitialCamera } from '@/components/map/types';
import type { PlanMapProps } from '@/components/plan-map';
import { usePlanCamera } from '@/hooks/use-plan-camera';
import { copy } from '@/lib/copy';
import { useRideViewStore } from '@/store/ride-view-store';

export interface HomeMapProps extends PlanMapProps {
  /** Tilt of the first frame: set when the map is created already in the ride view (a cold start into the ride). */
  initialPitch?: number;
  /** The map's camera handle: Home shares it with the ride view, whose navigation camera drives the same map. */
  mapRef: RefObject<MapHandle | null>;
  /**
   * The ride view owns the map: the ride's layers are drawn instead of the planning scene's, and only the ride's navigation
   * camera moves it. The planning camera stands down (and its intent runs again when this turns false).
   */
  rideView: boolean;
}

const NO_LINES: never[] = [];
const NO_ROUTES: PlanMapProps['routes'] = [];

/**
 * Home's one map (28 §8): a single `MapLibreMap` that is never remounted, with two scenes that take turns. The planning
 * scene (route lines, pins, my dot, the browse camera) and the ride scene (trail, route, stop, riders, the navigation
 * camera, published by `RideView` through the ride-view store). Only one scene's sources and layers are mounted at a time;
 * the ids differ (`nav-route-<i>` against `nav-route`) and each scene sits under its own React key, so a switch removes
 * one and adds the other cleanly, native markers included. Starting or opening a ride therefore never reloads the map.
 */
export function HomeMap({
  mapRef,
  rideView,
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
  initialPitch,
  frameFallback = false,
  follow,
  onUserGesture,
  onIdle,
  onMapError,
  onMapPress,
}: HomeMapProps) {
  const scene = useRideViewStore((s) => s.scene);
  // Until the ride is loaded nothing of it is drawn: the planning scene keeps the map.
  const ride = rideView && scene?.loaded ? scene : null;
  const zoomRef = useRef(initial.zoom);
  // The first frame only: later changes to `initial` are ignored on purpose (the cameras move by calls).
  const [initialCamera] = useState<MapInitialCamera>(() => ({
    center: [initial.lng, initial.lat],
    zoom: initial.zoom,
    ...(initialPitch ? { pitch: initialPitch } : {}),
  }));

  // Leaving the ride view: the follow camera's last idles (and the restore's start) are not where Home was left.
  const wasRide = useRef(rideView);
  const ignoreIdleUntil = useRef(0);
  useEffect(() => {
    if (wasRide.current && !rideView) ignoreIdleUntil.current = Date.now() + 1200;
    wasRide.current = rideView;
  }, [rideView]);

  usePlanCamera({
    mapRef,
    active: !rideView,
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
  const lines = usePlanLines({ routes: ride ? NO_ROUTES : routes, onSelectRoute, faded });

  return (
    <View style={styles.root}>
      <MapLibreMap
        ref={mapRef}
        accessibilityLabel={ride ? copy['map.a11yRide'] : copy['map.a11y']}
        initialCamera={initialCamera}
        lines={ride ? NO_LINES : lines}
        onPress={ride ? ride.handlers.onPress : onMapPress}
        onGesture={ride ? ride.handlers.onGesture : onUserGesture}
        onError={onMapError}
        onIdle={(c) => {
          zoomRef.current = c.zoom;
          if (ride) ride.handlers.onIdle(c);
          // The browse camera is saved while browsing; the ride view's follow camera is not where Home was left.
          else if (!rideView && Date.now() >= ignoreIdleUntil.current) onIdle({ lat: c.center[1], lng: c.center[0], zoom: c.zoom });
        }}>
        {ride ? (
          <Fragment key="ride-scene">
            <RideLayers {...ride.layers} />
          </Fragment>
        ) : (
          <Fragment key="plan-scene">
            <PlanLayers me={me} place={place} routeLabels={routeLabels} onSelectRoute={onSelectRoute} pins={pins} onPinPress={onPinPress} />
          </Fragment>
        )}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
