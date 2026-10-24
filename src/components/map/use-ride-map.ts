import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useWindowDimensions } from 'react-native';

import type { RideLayersProps, MapRider } from '@/components/map/ride-layers';
import type { RideMapChromeProps } from '@/components/map/ride-map-chrome';
import type { MapHandle, MapIdle } from '@/components/map/types';
import { useNavCamera, type CameraAdapter } from '@/hooks/use-nav-camera';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTerrainOn } from '@/hooks/use-terrain-on';
import { pillLineCount, pillLines } from '@/lib/credits';
import { DEM_PROVIDER } from '@/lib/flags';
import type { Trail } from '@/lib/geo';
import { mapControlVisibility } from '@/lib/live-chrome';
import { fitBoundsFor } from '@/lib/map-fit';
import { CLUSTER_DP, spreadDp } from '@/lib/marker-cluster';
import { centerPadding } from '@/lib/nav-camera';
import type { NavLine, RideStop } from '@/lib/stop-ui';
import { usePrefsStore } from '@/store/prefs-store';

export interface UseRideMapArgs {
  /** Everyone with a position, me included. */
  riders: MapRider[];
  trail: Trail;
  selectedUserId: string | null;
  /** Changes on every selection (even of the same rider): eases the camera to the selected rider. */
  focusNonce: number;
  onSelect: (userId: string) => void;
  onClearSelection: () => void;
  /** Dp of the map covered at the top (header, banner, convoy strip): the camera keeps clear of it. */
  topInset: number;
  /** Dp of the map covered by the rider sheet at its current snap; camera padding follows it. */
  bottomInset: number;
  /** The expanded sheet leaves no map to control. */
  controlsHidden: boolean;
  /** Map left visible above the sheet (and under `topInset`): small values hide the controls (20 C1). */
  mapVisH: number;
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
  /** Voice toggle state while navigating (null = not navigating: no toggle). */
  voice: { on: boolean; onToggle: () => void } | null;
  /** The map's camera handle, and the height of the area it fills (0 until laid out). */
  mapRef: RefObject<MapHandle | null>;
  areaH: number;
  /** The first follow ease lasts this long instead of jumping (entering the ride view from Home). */
  entryEaseMs?: number;
  /** False leaves the map to another camera (the stop search's): the navigation camera keeps its state and moves nothing. */
  enabled?: boolean;
}

const CLUSTER_MAX_ZOOM = 18;
const CLUSTER_MIN_SPAN_M = 120;
const FIT_MS = 400;
/** A marker press can also reach Map.onPress on Android (maplibre-react-native #1618). */
const MARKER_PRESS_GUARD_MS = 400;

/**
 * Everything the live map does around its drawing, shared by the live screen's `RideMap` and Home's one map: the
 * navigation camera (`useNavCamera` driving the map's handle), the cluster zoom, press handling, the credit lines and the
 * control visibility. It draws nothing: `layers` go to `RideLayers`, `chrome` to `RideMapChrome`, `handlers` to the map.
 */
export function useRideMap({
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
  entryEaseMs,
  enabled = true,
}: UseRideMapArgs) {
  const markerPressAt = useRef(0);
  // Camera zoom for clustering, updated in quarter-zoom steps so panning does not re-render.
  const [clusterZoom, setClusterZoom] = useState(14);
  const tilt = usePrefsStore((s) => s.mapTilt);
  const reduceMotion = useReduceMotion();
  const { fontScale } = useWindowDimensions();

  // The map answers through its handle; a handle that is not there yet (the map is mounting) drops the move.
  const adapter = useMemo<CameraAdapter>(
    () => ({
      easeTo: (o) => mapRef.current?.easeTo(o),
      fitBounds: (bounds, o) => mapRef.current?.fitBounds(bounds, o),
      getZoom: () => mapRef.current?.getZoom() ?? null,
      getBounds: () => mapRef.current?.getBounds() ?? null,
    }),
    [mapRef],
  );

  const nav = useNavCamera({
    riders,
    areaH,
    topInset,
    bottomInset,
    selectedUserId,
    focusNonce,
    adapter: enabled ? adapter : null,
    tilt,
    reduceMotion,
    stop,
    stopFocusNonce: focusStopNonce,
    entryEaseMs,
  });

  // A banner tap asks for follow mode again; the map reports its bearing for the banner's compass arrow.
  const { recentre: recentreCamera, mapBearing, userGesture } = nav;
  const seenRecentre = useRef(recentreNonce);
  useEffect(() => {
    if (recentreNonce === seenRecentre.current) return;
    seenRecentre.current = recentreNonce;
    recentreCamera();
  }, [recentreNonce, recentreCamera]);
  useEffect(() => {
    onMapBearing(Math.round(mapBearing));
  }, [mapBearing, onMapBearing]);

  const onIdle = useCallback(({ zoom }: MapIdle) => {
    setClusterZoom((prev) => (Math.abs(prev - zoom) >= 0.25 ? zoom : prev));
  }, []);

  const onPress = () => {
    if (Date.now() - markerPressAt.current < MARKER_PRESS_GUARD_MS) return;
    onClearSelection();
  };
  const onMarkerPress = (userId: string) => {
    markerPressAt.current = Date.now();
    onSelect(userId);
  };
  const onClusterPress = (members: MapRider[]) => {
    markerPressAt.current = Date.now();
    // Still overlapping at the closest useful zoom (18): they are in the same spot, so select the
    // first and let the list scroll to it.
    if (spreadDp(members, CLUSTER_MAX_ZOOM) < CLUSTER_DP) {
      onSelect(members[0].userId);
      return;
    }
    // fitBounds has no maxZoom option; a minimum span of ~120 m keeps the result at zoom 18 or less.
    const bounds = fitBoundsFor(members, CLUSTER_MIN_SPAN_M);
    if (!bounds) return;
    userGesture();
    mapRef.current?.fitBounds(bounds, {
      padding: centerPadding({ areaH, topInset, bottomInset }),
      durationMs: FIT_MS,
      keepView: true,
    });
  };

  // A road route drawn means LocationIQ data: the pill names it on a second line (24 §4.2). The dashed line is no route data.
  const roadRoute = !!navLine && !navLine.dashed;
  // Terrain adds its own last line while the hillshade is mounted (25 §5.1).
  const terrain = useTerrainOn();
  const creditKeys = pillLines({ kind: 'live', roadRoute, provider: navLine?.provider }, terrain, DEM_PROVIDER);
  const creditLines = pillLineCount(creditKeys);
  const hasRiders = riders.length > 0;
  const meRider = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders]);
  const vis = mapControlVisibility({
    controlsHidden,
    mapVisH,
    positionedRiders: riders.length,
    navActive: !!voice,
    creditLines,
    fontScale,
  });

  const layers: RideLayersProps = {
    riders,
    trail,
    navLine,
    stop,
    selectedUserId,
    zoom: clusterZoom,
    myCourseDeg: nav.myCourseDeg,
    mySpeedMps: nav.mySpeedMps,
    mapBearing,
    reduceMotion,
    onMarkerPress,
    onClusterPress,
  };
  const chrome: Pick<
    RideMapChromeProps,
    'hasRiders' | 'topInset' | 'creditKeys' | 'vis' | 'mode' | 'canRecentre' | 'recentre' | 'showAll' | 'voice' | 'reduceMotion'
  > = {
    hasRiders,
    topInset,
    creditKeys,
    vis,
    // No fix of mine yet: the camera has nothing to follow, but it is not "free" or an overview either (no Re-centre pill).
    mode: meRider ? nav.mode : 'follow',
    canRecentre: !!meRider,
    recentre: nav.recentre,
    showAll: nav.showAll,
    voice,
    reduceMotion,
  };

  return {
    layers,
    chrome,
    nav,
    creditLines,
    /** Handlers for the map: a touch ends follow / overview; a press clears the selection; idle steps the cluster zoom. */
    handlers: { onGesture: userGesture, onPress, onIdle },
  };
}
