import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { MapLibreMap } from '@/components/map/maplibre-map';
import { RideLayers, type MapRider } from '@/components/map/ride-layers';
import { RideMapChrome } from '@/components/map/ride-map-chrome';
import type { MapHandle, MapInitialCamera } from '@/components/map/types';
import { useRideMap } from '@/components/map/use-ride-map';
import { copy } from '@/lib/copy';
import type { Trail } from '@/lib/geo';
import { liveStartView } from '@/lib/live-camera';
import { fitBoundsFor } from '@/lib/map-fit';
import { followPitch } from '@/lib/nav-camera';
import type { RideStop, NavLine } from '@/lib/stop-ui';
import { useNavStore } from '@/store/nav-store';
import { usePlanStore } from '@/store/plan-store';
import { usePrefsStore } from '@/store/prefs-store';

export type { MapRider } from '@/components/map/ride-layers';

interface RideMapProps {
  /** Everyone with a position, me included. */
  riders: MapRider[];
  trail: Trail;
  selectedUserId: string | null;
  /** Changes on every selection (even of the same rider): eases the camera to the selected rider. */
  focusNonce: number;
  onSelect: (userId: string) => void;
  onClearSelection: () => void;
  /** Dp of the map covered at the top (convoy strip). */
  topInset: number;
  /** Dp of the map covered by the rider sheet at its current snap; camera padding follows it. */
  bottomInset: number;
  /** Animated (negative) shift that lifts the controls and attribution with the sheet's top edge. */
  overlayShift: SharedValue<number>;
  /** The expanded sheet leaves no map to control. */
  controlsHidden: boolean;
  /** Map left visible above the sheet (and under `topInset`): small values hide the controls (20 C1). */
  mapVisH: number;
  /** Full map (19 B): the toggle control swaps its icon; the parent hides its chrome. */
  fullMap: boolean;
  onToggleFullMap: () => void;
  /** Dp of system navigation bar under the map in full map; attribution and controls clear it. */
  overlayBottomInset: number;
  /** My speed in whole km/h (null when unknown or < 3): the bubble shows in follow mode only, in the "me" slot. */
  speedKmh: number | null;
  /** "Me" slot offset from the overlay bottom (above the attribution, or above the floating SOS). */
  meSlotBottom: number;
  /** The ride's next stop: draws the destination pin. */
  stop: Pick<RideStop, 'lat' | 'lng' | 'kind' | 'category'> | null;
  /** My route to the stop (drawn under the markers, over the leader trail); null = nothing to draw. */
  navLine: NavLine | null;
  /** Bumps to frame me + the stop once (card tap, or after picking a stop). */
  focusStopNonce: number;
  /** Bumps to go back to following me (a tap on the turn banner, 21 §2.5). */
  recentreNonce: number;
  /** Tells the screen the map's bearing (whole degrees), so the banner's compass arrow can be turned with it. */
  onMapBearing: (deg: number) => void;
  /** Voice toggle state while navigating (null = not navigating: no toggle); shown in solo only (C1). */
  voice: { on: boolean; onToggle: () => void } | null;
}

/**
 * Live map (06 §3, 18): the live screen's own MapLibre map, composed of the shared pieces: `MapLibreMap` (the map and its
 * camera handle), `RideLayers` (trail, route, stop, riders, me) and `RideMapChrome` (credit pill, controls), driven by
 * `useRideMap` (navigation camera: follows me heading-up and tilted by default, can fit everyone, goes free as soon as the
 * rider touches the map). Home's ride view composes the same pieces on its one map.
 */
export function RideMap({
  riders,
  trail,
  selectedUserId,
  focusNonce,
  onSelect,
  onClearSelection,
  topInset,
  bottomInset,
  overlayShift,
  controlsHidden,
  mapVisH,
  fullMap,
  onToggleFullMap,
  overlayBottomInset,
  speedKmh,
  meSlotBottom,
  stop,
  navLine,
  focusStopNonce,
  recentreNonce,
  onMapBearing,
  voice,
}: RideMapProps) {
  const mapRef = useRef<MapHandle>(null);
  const [areaH, setAreaH] = useState(0);
  const tilt = usePrefsStore((s) => s.mapTilt);

  // Initial camera: me (so the first frame is already close to the road), else everyone, else where the app already
  // knew me (Home's planning fix, its saved camera, India): never a black ocean while the first fix is awaited.
  const [initial] = useState<MapInitialCamera>(() => {
    const mine = riders.find((r) => r.isMe);
    const start = liveStartView({
      me: mine ?? null,
      bounds: fitBoundsFor(riders),
      planning: useNavStore.getState().origin,
      planningAt: useNavStore.getState().originAt,
      now: Date.now(),
      saved: usePlanStore.getState().camera,
    });
    return start.kind === 'bounds'
      ? { bounds: start.bounds, padding: { top: 104, right: 48, bottom: 76, left: 48 } }
      : { center: start.center, zoom: start.zoom, pitch: start.kind === 'saved' ? 0 : followPitch(tilt) };
  });

  const ride = useRideMap({
    riders,
    trail,
    selectedUserId,
    focusNonce,
    onSelect,
    onClearSelection,
    topInset,
    bottomInset,
    controlsHidden,
    mapVisH,
    stop,
    navLine,
    focusStopNonce,
    recentreNonce,
    onMapBearing,
    voice,
    mapRef,
    areaH,
  });

  return (
    <View style={styles.root} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
      <MapLibreMap
        ref={mapRef}
        accessibilityLabel={copy['map.a11yRide']}
        initialCamera={initial}
        lines={NO_LINES}
        onPress={ride.handlers.onPress}
        onGesture={ride.handlers.onGesture}
        onIdle={ride.handlers.onIdle}>
        <RideLayers {...ride.layers} />
      </MapLibreMap>

      <RideMapChrome
        {...ride.chrome}
        speedKmh={speedKmh}
        meSlotBottom={meSlotBottom}
        fullMap={fullMap}
        onToggleFullMap={onToggleFullMap}
        overlayShift={overlayShift}
        overlayBottomInset={overlayBottomInset}
      />
    </View>
  );
}

const NO_LINES: never[] = [];

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
