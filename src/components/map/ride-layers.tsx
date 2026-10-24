import { GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { markerLiftStyle } from '@/components/marker-lift';
import { MeMarker } from '@/components/me-marker';
import { RiderAvatar } from '@/components/rider-avatar';
import { navRouteLayerProps } from '@/components/route-layers';
import { StopPin } from '@/components/stop-pin';
import type { Trail } from '@/lib/geo';
import { drawOrder, meCoversCluster } from '@/lib/marker-cluster';
import { normalizeDeg } from '@/lib/nav-camera';
import { clusterRingStatus, MARKER_STYLE } from '@/lib/marker-style';
import type { RiderStatus } from '@/lib/rider-status';
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
import type { NavLine, RideStop } from '@/lib/stop-ui';
import { splitTrailAt, trimRouteAt } from '@/lib/trail-split';
import { family, font, palette, size } from '@/theme/tokens';
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

export interface RideLayersProps {
  /** Everyone with a position, me included. */
  riders: MapRider[];
  trail: Trail;
  /** My route to the stop (drawn under the markers, over the leader trail); null = nothing to draw. */
  navLine: NavLine | null;
  /** The ride's next stop: draws the destination pin. */
  stop: Pick<RideStop, 'lat' | 'lng' | 'kind' | 'category'> | null;
  selectedUserId: string | null;
  /** Camera zoom for clustering, in quarter-zoom steps (the parent steps it). */
  zoom: number;
  /** My effective course, speed and the map's bearing: my arrow points relative to the heading-up map. */
  myCourseDeg: number | null;
  mySpeedMps: number | null;
  mapBearing: number;
  reduceMotion: boolean;
  onMarkerPress: (userId: string) => void;
  onClusterPress: (members: MapRider[]) => void;
}

const MARKER_BOX = 56;
const SOS_BOX = 112;

/**
 * The ride's scene inside a MapLibre `Map` (06 §3, 18): the crossed and the ahead leader trail, my route to the stop, the
 * stop pin, the start dot, one marker per rider (clustered when close) and my own dot. Draws nothing else: the camera and
 * the controls belong to the parent, so the live screen's map and Home's one map draw the same ride.
 */
export function RideLayers({
  riders,
  trail,
  navLine,
  stop,
  selectedUserId,
  zoom,
  myCourseDeg,
  mySpeedMps,
  mapBearing,
  reduceMotion,
  onMarkerPress,
  onClusterPress,
}: RideLayersProps) {
  const { colors, scheme, style } = useTheme();

  // Stable identities so memoised markers do not re-render when the parent does.
  const markerPressRef = useRef(onMarkerPress);
  const clusterPressRef = useRef(onClusterPress);
  useEffect(() => {
    markerPressRef.current = onMarkerPress;
    clusterPressRef.current = onClusterPress;
  });
  const [stablePress] = useState(() => (userId: string) => markerPressRef.current(userId));
  const [stableClusterPress] = useState(() => (members: MapRider[]) => clusterPressRef.current(members));

  // Crossed part of the trail fades, the part still ahead stays bright (split at my position).
  const meRider = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders]);
  const meLat = meRider?.lat;
  const meLng = meRider?.lng;
  const iAmLeader = !!meRider?.leader;
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

  // Screen-space clusters (< 44 dp apart); riders near an SOS marker are nudged clear of it. Draw
  // order: riders and clusters, my dot, then SOS on top of everything.
  const ordered = useMemo(() => drawOrder(riders, zoom), [riders, zoom]);
  const startLngLat = useMemo<[number, number] | null>(
    () => (trail.points.length >= 2 ? [trail.points[0].lng, trail.points[0].lat] : null),
    [trail],
  );

  return (
    <>
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
          <StopPin kind={stop.kind} category={stop.category} />
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
              meOverlaps={meCoversCluster(item, meRider, zoom)}
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
            heading={myCourseDeg == null ? null : normalizeDeg(myCourseDeg - mapBearing)}
            speedMps={mySpeedMps}
            accuracyM={r.accuracyM}
            zoom={zoom}
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
    </>
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
  startDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
});
