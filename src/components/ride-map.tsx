import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type InitialViewState,
  type LngLatBounds,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { MeMarker } from '@/components/me-marker';
import { RiderAvatar } from '@/components/rider-avatar';
import { StopPin } from '@/components/stop-pin';
import { MapControls } from '@/components/map-controls';
import { navRouteLayerProps } from '@/components/route-layers';
import { useNavCamera, type CameraAdapter } from '@/hooks/use-nav-camera';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy } from '@/lib/copy';
import { mapControlVisibility, meSlotKind } from '@/lib/live-chrome';
import type { Trail } from '@/lib/geo';
import { fitBoundsFor } from '@/lib/map-fit';
import { CLUSTER_DP, drawOrder, meCoversCluster, spreadDp } from '@/lib/marker-cluster';
import { centerPadding, followPitch, normalizeDeg } from '@/lib/nav-camera';
import { markerLiftStyle } from '@/components/marker-lift';
import { clusterRingStatus, MARKER_STYLE } from '@/lib/marker-style';
import type { RiderStatus } from '@/lib/rider-status';
import type { RideStop, NavLine } from '@/lib/stop-ui';
import {
  CASING_WIDTH,
  lineData,
  NAV_ROUTE_SOURCE_ID,
  PASSED_LAYER_ID,
  PASSED_OPACITY,
  PASSED_SOURCE_ID,
  PASSED_WIDTH,
  ROUTE_WIDTH,
} from '@/lib/route-style';
import { splitTrailAt, trimRouteAt } from '@/lib/trail-split';
import { track } from '@/lib/telemetry';
import { usePrefsStore } from '@/store/prefs-store';
import { elevate, family, font, palette, radius, size, space } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

export interface MapRider {
  userId: string;
  name: string;
  colorIndex: number;
  leader: boolean;
  status: RiderStatus;
  /** Offline: last known position, drawn faded with a dashed ring. */
  stale: boolean;
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  /** recorded_at in ms (for deriving my course/speed). */
  recordedAtMs?: number | null;
  /** GPS accuracy in metres (Maps style draws it as a halo). */
  accuracyM: number | null;
  isMe: boolean;
}

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
  stop: Pick<RideStop, 'lat' | 'lng' | 'kind'> | null;
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

const CLUSTER_MAX_ZOOM = 18;
const CLUSTER_MIN_SPAN_M = 120;
const FIT_MS = 400;
/** A marker press can also reach Map.onPress on Android (maplibre-react-native #1618). */
const MARKER_PRESS_GUARD_MS = 400;
const MARKER_BOX = 56;
const SOS_BOX = 112;

/**
 * Live map (06 §3, 18): MapLibre map with the leader trail, one marker per rider and my own dot.
 * Navigation-style camera (`useNavCamera`): follows me heading-up and tilted by default, can fit
 * everyone, and goes free as soon as the rider touches the map. Native attribution/logo are off; the
 * OSM attribution pill is drawn here instead.
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
  const { colors, scheme, style } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const lastBounds = useRef<LngLatBounds | null>(null);
  const lastZoom = useRef<number | null>(null);
  const markerPressAt = useRef(0);
  const [areaH, setAreaH] = useState(0);
  // Camera zoom for clustering, updated in quarter-zoom steps so panning does not re-render.
  const [clusterZoom, setClusterZoom] = useState(14);
  const tilt = usePrefsStore((s) => s.mapTilt);
  const reduceMotion = useReduceMotion();

  // Initial camera: me (so the first frame is already close to the road), else everyone, else the world.
  const [initial] = useState(() => {
    const mine = riders.find((r) => r.isMe);
    const bounds = fitBoundsFor(riders);
    const view: InitialViewState = mine
      ? { center: [mine.lng, mine.lat], zoom: 16.5, pitch: followPitch(tilt) }
      : bounds
        ? { bounds, padding: { top: 104, right: 48, bottom: 76, left: 48 } }
        : { center: [0, 20], zoom: 2 };
    return { view };
  });

  const adapter = useMemo<CameraAdapter>(
    () => ({
      easeTo: ({ center, zoom, bearing, pitch, padding, durationMs, linear }) =>
        cameraRef.current?.easeTo({
          center,
          zoom,
          bearing,
          pitch,
          padding,
          duration: durationMs,
          easing: linear ? 'linear' : 'ease',
        }),
      fitBounds: (bounds, { padding, durationMs }) =>
        cameraRef.current?.fitBounds(bounds, { padding, duration: durationMs, bearing: 0, pitch: 0 }),
      getZoom: () => lastZoom.current,
      getBounds: () => lastBounds.current,
    }),
    [],
  );

  const nav = useNavCamera({
    riders,
    areaH,
    topInset,
    bottomInset,
    selectedUserId,
    focusNonce,
    adapter,
    tilt,
    reduceMotion,
    stop,
    stopFocusNonce: focusStopNonce,
  });

  // A banner tap asks for follow mode again; the map reports its bearing for the banner's compass arrow.
  const { recentre: recentreCamera, mapBearing } = nav;
  const seenRecentre = useRef(recentreNonce);
  useEffect(() => {
    if (recentreNonce === seenRecentre.current) return;
    seenRecentre.current = recentreNonce;
    recentreCamera();
  }, [recentreNonce, recentreCamera]);
  useEffect(() => {
    onMapBearing(Math.round(mapBearing));
  }, [mapBearing, onMapBearing]);

  const onRegionChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    // Programmatic eases report userInteraction false; only the rider's own touch ends follow/overview.
    if (e.nativeEvent.userInteraction) nav.userGesture();
  };

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, zoom } = e.nativeEvent;
    lastBounds.current = bounds;
    lastZoom.current = zoom;
    setClusterZoom((prev) => (Math.abs(prev - zoom) >= 0.25 ? zoom : prev));
    onRegionChange(e);
  };

  const onMapPress = () => {
    if (Date.now() - markerPressAt.current < MARKER_PRESS_GUARD_MS) return;
    onClearSelection();
  };

  const onMarkerPress = (userId: string) => {
    markerPressAt.current = Date.now();
    onSelect(userId);
  };
  // Stable identity so memoised markers do not re-render when the parent does.
  const markerPressRef = useRef(onMarkerPress);
  useEffect(() => {
    markerPressRef.current = onMarkerPress;
  });
  const [stablePress] = useState(() => (userId: string) => markerPressRef.current(userId));

  // Crossed part of the trail fades, the part still ahead stays bright (split at my position).
  const meLat = riders.find((r) => r.isMe)?.lat;
  const meLng = riders.find((r) => r.isMe)?.lng;
  const iAmLeader = riders.some((r) => r.isMe && r.leader);
  const split = useMemo(
    () => splitTrailAt(trail, meLat != null && meLng != null ? { lat: meLat, lng: meLng } : null, iAmLeader),
    [trail, meLat, meLng, iAmLeader],
  );
  const passedGeoJson = useMemo(() => lineData(split.behind), [split]);
  const aheadGeoJson = useMemo(() => lineData(split.ahead), [split]);
  const navGeoJson = useMemo(
    () => lineData(navLine ? trimRouteAt(navLine.coords, meLat != null && meLng != null ? { lat: meLat, lng: meLng } : null) : []),
    [navLine, meLat, meLng],
  );
  const stopLngLat = useMemo<[number, number] | null>(() => (stop ? [stop.lng, stop.lat] : null), [stop]);
  const navLayers = navRouteLayerProps(colors, navLine?.dashed ?? false);
  // OSRM must be credited wherever a road route is drawn (21 §5.1); the dashed fallback is no OSRM data.
  const attribution = navLine && !navLine.dashed ? copy['live.attributionRoute'] : copy['live.attribution'];

  // Screen-space clusters (< 44 dp apart); riders near an SOS marker are nudged clear of it. Draw
  // order: riders and clusters, my dot, then SOS on top of everything.
  const ordered = useMemo(() => drawOrder(riders, clusterZoom), [riders, clusterZoom]);

  const meRider = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders]);
  const startLngLat = useMemo<[number, number] | null>(
    () => (trail.points.length >= 2 ? [trail.points[0].lng, trail.points[0].lat] : null),
    [trail],
  );

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
    nav.userGesture();
    cameraRef.current?.fitBounds(bounds, {
      padding: centerPadding({ areaH, topInset, bottomInset }),
      duration: FIT_MS,
    });
  };
  const clusterPressRef = useRef(onClusterPress);
  useEffect(() => {
    clusterPressRef.current = onClusterPress;
  });
  const [stableClusterPress] = useState(() => (members: MapRider[]) => clusterPressRef.current(members));

  const hasRiders = riders.length > 0;
  const overview = nav.mode === 'overview';
  const vis = mapControlVisibility({ controlsHidden, mapVisH, positionedRiders: riders.length, navActive: !!voice });
  const controlsStyle = useAnimatedStyle(() => ({ transform: [{ translateY: overlayShift.value }] }));

  return (
    <View style={styles.root} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Map
          mapStyle={colors.mapStyle}
          compass={false}
          touchRotate={false}
          touchPitch={false}
          scaleBar={false}
          logo={false}
          attribution={false}
          onPress={onMapPress}
          onRegionWillChange={onRegionChange}
          onRegionIsChanging={onRegionChange}
          onRegionDidChange={onRegionDidChange}>
          <Camera ref={cameraRef} initialViewState={initial.view} />
          {/* Layer order bottom to top: passed trail, ahead trail, nav route (mount order, all inserted
              below the first label layer after the last road). Sources stay mounted and only their
              data changes, so the order never has to be rebuilt. */}
          <GeoJSONSource key={`passed-${style}-${scheme}`} id={PASSED_SOURCE_ID} data={passedGeoJson}>
            <Layer
              id={PASSED_LAYER_ID}
              type="line"
              beforeId={colors.routeBeforeId}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-width': PASSED_WIDTH, 'line-color': colors.trailPassed, 'line-opacity': PASSED_OPACITY }}
            />
          </GeoJSONSource>
          <GeoJSONSource key={`trail-${style}-${scheme}`} id="leader-trail" data={aheadGeoJson}>
            <Layer
              id="leader-trail-casing"
              type="line"
              beforeId={colors.routeBeforeId}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-width': CASING_WIDTH, 'line-color': colors.routeCasing, 'line-opacity': 1 }}
            />
            <Layer
              id="leader-trail-line"
              type="line"
              beforeId={colors.routeBeforeId}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-width': ROUTE_WIDTH, 'line-color': colors.routeLine, 'line-opacity': 1 }}
            />
          </GeoJSONSource>
          {/* My route to the shared stop: strongest line. Straight-line fallback is dashed, no casing. */}
          <GeoJSONSource key={`nav-${style}-${scheme}`} id={NAV_ROUTE_SOURCE_ID} data={navGeoJson}>
            {navLine && !navLine.dashed ? (
              <Layer id="nav-route-casing" type="line" beforeId={colors.routeBeforeId} {...navLayers.casing} />
            ) : null}
            <Layer
              key={navLine?.dashed ? 'dashed' : 'solid'}
              id="nav-route-line"
              type="line"
              beforeId={colors.routeBeforeId}
              {...navLayers.line}
            />
          </GeoJSONSource>
          {stopLngLat && stop ? (
            <Marker id="nav-stop" lngLat={stopLngLat} anchor="bottom">
              <StopPin kind={stop.kind} />
            </Marker>
          ) : null}
          {startLngLat ? (
            <Marker id="ride-start" lngLat={startLngLat}>
              <View
                pointerEvents="none"
                style={[
                  styles.startDot,
                  scheme === 'dark'
                    ? { backgroundColor: colors.paper, borderColor: colors.ink }
                    : { backgroundColor: colors.ink, borderColor: colors.markerOutline },
                ]}
              />
            </Marker>
          ) : null}
          {ordered.map((item) => {
            if (item.kind === 'cluster') {
              return (
                <RiderCluster
                  key={item.id}
                  id={item.id}
                  members={item.members}
                  lat={item.lat}
                  lng={item.lng}
                  worst={item.worst}
                  meOverlaps={meCoversCluster(item, meRider, clusterZoom)}
                  onPress={stableClusterPress}
                />
              );
            }
            const r = item.rider;
            return r.isMe ? (
              <MeMapMarker
                key={r.userId}
                lat={r.lat}
                lng={r.lng}
                heading={nav.myCourseDeg == null ? null : normalizeDeg(nav.myCourseDeg - nav.mapBearing)}
                speedMps={nav.mySpeedMps}
                accuracyM={r.accuracyM}
                zoom={clusterZoom}
              />
            ) : (
              <RiderMarker
                key={r.userId}
                userId={r.userId}
                name={r.name}
                colorIndex={r.colorIndex}
                leader={r.leader}
                status={r.status}
                stale={r.stale}
                lat={r.lat}
                lng={r.lng}
                selected={r.userId === selectedUserId}
                reduceMotion={reduceMotion}
                onPress={stablePress}
              />
            );
          })}
        </Map>
      </View>

      {!hasRiders ? (
        <View
          pointerEvents="none"
          style={[styles.waiting, { top: topInset + space.md, backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.waitingText, { color: colors.text }]}>
            {copy['live.mapWaiting']}
          </Text>
        </View>
      ) : null}

      {/* Attribution and controls ride on the sheet's top edge. */}
      <Reanimated.View
        pointerEvents="box-none"
        style={[styles.overlay, { bottom: overlayBottomInset }, controlsStyle]}>
        <View pointerEvents="none" style={[styles.attribution, { backgroundColor: colors.surfaceRaised }]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.attributionText, { color: colors.text }]}>
            {attribution}
          </Text>
        </View>
        <MapControls
          vis={vis}
          meSlot={meSlotKind(nav.mode, speedKmh)}
          speedKmh={speedKmh}
          meSlotBottom={meSlotBottom}
          fullMap={fullMap}
          overview={overview}
          canRecentre={!!meRider}
          onToggleFullMap={onToggleFullMap}
          onRecentre={() => {
            track('map.recentre');
            nav.recentre();
          }}
          onFitAll={() => {
            track('map.fit_all');
            nav.showAll();
          }}
          voiceOn={voice ? voice.on : null}
          onToggleVoice={voice?.onToggle}
          reduceMotion={reduceMotion}
        />
      </Reanimated.View>
    </View>
  );
}

interface RiderMarkerProps {
  userId: string;
  name: string;
  colorIndex: number;
  leader: boolean;
  status: RiderStatus;
  stale: boolean;
  lat: number;
  lng: number;
  selected: boolean;
  reduceMotion: boolean;
  onPress: (userId: string) => void;
}

/** Memoised on primitives: a marker re-renders only when its own rider changes. */
const RiderMarker = memo(function RiderMarker({
  userId,
  name,
  colorIndex,
  leader,
  status,
  stale,
  lat,
  lng,
  selected,
  reduceMotion,
  onPress,
}: RiderMarkerProps) {
  const { colors } = useTheme();
  const sos = status === 'sos';
  const box = sos ? SOS_BOX : MARKER_BOX;
  const lngLat = useMemo<[number, number]>(() => [lng, lat], [lng, lat]);
  const avatar = sos ? size.avatarSos : size.avatar;
  const outer = avatar + (sos ? 12 : 8);

  return (
    <Marker
      id={userId}
      lngLat={lngLat}
      onPress={(e) => {
        e.stopPropagation?.();
        onPress(userId);
      }}>
      <View style={[styles.markerBox, { width: box, height: box }]}>
        {sos ? <SosHalo diameter={outer} still={reduceMotion} /> : null}
        <View
          style={[
            styles.selection,
            {
              width: outer + 8,
              height: outer + 8,
              borderRadius: (outer + 8) / 2,
              borderColor: selected ? colors.brand.primary : 'transparent',
            },
          ]}>
          <RiderAvatar
            name={name}
            colorIndex={colorIndex}
            size={avatar}
            status={status}
            stale={stale}
            leader={leader}
            ringWhenMoving={false}
            strokeWidth={MARKER_STYLE.strokeDp}
            lift
          />
        </View>
      </View>
    </Marker>
  );
});

function SosHalo({ diameter, still }: { diameter: number; still: boolean }) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);
  if (still) return null;
  return (
    <Animated.View
      style={[
        styles.halo,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
        },
      ]}
    />
  );
}

const CLUSTER_SIZE = MARKER_STYLE.clusterDp;

/** Several riders under one marker: count in the middle, worst status as ring and badge. */
const RiderCluster = memo(function RiderCluster({
  id,
  members,
  lat,
  lng,
  worst,
  meOverlaps,
  onPress,
}: {
  id: string;
  members: MapRider[];
  lat: number;
  lng: number;
  worst: RiderStatus;
  meOverlaps: boolean;
  onPress: (members: MapRider[]) => void;
}) {
  const lngLat = useMemo<[number, number]>(() => [lng, lat], [lng, lat]);
  const ringStatus = clusterRingStatus(worst);
  const ring = statusColors(worst);
  const ringColor = worst === 'sos' ? palette.status.sos : ring.bg;
  // Ring only for stopped / offline / SOS; a moving cluster is a plain ink disc like the rider markers.
  const outer = ringStatus ? CLUSTER_SIZE + 8 : CLUSTER_SIZE;
  return (
    <Marker
      id={id}
      lngLat={lngLat}
      onPress={(e) => {
        e.stopPropagation?.();
        onPress(members);
      }}>
      <View style={[styles.markerBox, { width: MARKER_BOX + 8, height: MARKER_BOX + 8 }]}>
        <View
          style={[
            styles.clusterRing,
            {
              width: outer,
              height: outer,
              borderRadius: outer / 2,
              borderWidth: ringStatus ? MARKER_STYLE.ringDp : 0,
              borderColor: ringStatus ? ringColor : 'transparent',
            },
          ]}>
          <View style={styles.cluster}>
            <Text allowFontScaling={false} style={styles.clusterCount}>
              {members.length}
            </Text>
          </View>
        </View>
        {/* Corner pill only while my dot sits over the cluster and could hide the centre count. */}
        {meOverlaps ? (
          <View style={styles.clusterCountPill}>
            <Text allowFontScaling={false} style={styles.clusterPillText}>
              {members.length}
            </Text>
          </View>
        ) : null}
        {ringStatus ? (
          <View style={[styles.clusterBadge, { backgroundColor: ringColor }]}>
            <Icon name={worst} color={ring.fg} size={12} />
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

const MeMapMarker = memo(function MeMapMarker({
  lat,
  lng,
  heading,
  speedMps,
  accuracyM,
  zoom,
}: {
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  accuracyM: number | null;
  zoom: number;
}) {
  const lngLat = useMemo<[number, number]>(() => [lng, lat], [lng, lat]);
  return (
    <Marker id="me" lngLat={lngLat}>
      <MeMarker variant="map" heading={heading} speedMps={speedMps} accuracyM={accuracyM} lat={lat} zoom={zoom} />
    </Marker>
  );
});

const liftStyle = markerLiftStyle();

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  markerBox: { alignItems: 'center', justifyContent: 'center' },
  selection: { alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  halo: { position: 'absolute', backgroundColor: palette.status.sos },
  clusterRing: { alignItems: 'center', justifyContent: 'center' },
  cluster: {
    ...liftStyle,
    width: CLUSTER_SIZE,
    height: CLUSTER_SIZE,
    borderRadius: CLUSTER_SIZE / 2,
    backgroundColor: MARKER_STYLE.inkColor,
    borderWidth: MARKER_STYLE.strokeDp,
    borderColor: palette.markerOutline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: { color: palette.markerOutline, fontSize: font.md, fontFamily: family.bold },
  clusterCountPill: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: size.avatar * 0.5,
    height: size.avatar * 0.5,
    paddingHorizontal: 4,
    borderRadius: (size.avatar * 0.5) / 2,
    backgroundColor: palette.markerStroke,
    borderWidth: 1.5,
    borderColor: palette.markerOutline,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  clusterPillText: { color: palette.markerOutline, fontSize: font.xs, fontFamily: family.bold },
  // Status badge sits top-left so it does not fight the (overlap-only) count pill.
  clusterBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiting: {
    position: 'absolute',
    top: space.md,
    alignSelf: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  waitingText: { fontSize: font.sm, fontFamily: family.semibold },
  // Anchored to the bottom of the map; `overlayShift` lifts it onto the sheet's top edge.
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 0 },
  attribution: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    borderRadius: 8,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    opacity: 0.85,
  },
  attributionText: { fontSize: font.xs, fontFamily: family.regular },
  startDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
});
