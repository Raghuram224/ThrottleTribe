// Web ride map: maplibre-gl (JS) + OpenFreeMap, same props and behaviour as ride-map.tsx (native
// MapLibre RN has no web build). Markers are DOM markers whose content is React Native views
// rendered through portals, so avatars, badges and colours match the native markers.
import 'maplibre-gl/dist/maplibre-gl.css';

import maplibregl, { type LngLatBoundsLike, type Map as MlMap } from 'maplibre-gl';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { MeMarker } from '@/components/me-marker';
import { RiderAvatar } from '@/components/rider-avatar';
import { StopPin } from '@/components/stop-pin';
import { SpeedBubble } from '@/components/speed-bubble';
import { useNavCamera, type CameraAdapter } from '@/hooks/use-nav-camera';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy } from '@/lib/copy';
import type { Trail } from '@/lib/geo';
import { fitBoundsFor, type Bounds } from '@/lib/map-fit';
import { CLUSTER_DP, drawOrder, meCoversCluster, spreadDp } from '@/lib/marker-cluster';
import { centerPadding, followPitch, normalizeDeg } from '@/lib/nav-camera';
import { clusterRingStatus, MARKER_STYLE } from '@/lib/marker-style';
import type { RiderStatus } from '@/lib/rider-status';
import { syncLeaderTrailLayers, syncNavRouteLayers } from '@/lib/route-layers-web';
import { lineData } from '@/lib/route-style';
import { splitTrailAt, trimRouteAt } from '@/lib/trail-split';
import type { NavLine, RideStop } from '@/lib/stop-ui';
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
  /** Full map (19 B): the toggle control swaps its icon; the parent hides its chrome. */
  fullMap: boolean;
  onToggleFullMap: () => void;
  /** Dp of system navigation bar under the map in full map; attribution and controls clear it. */
  overlayBottomInset: number;
  /** My speed in whole km/h (null when unknown or < 3): the bubble shows in follow mode only. */
  speedKmh: number | null;
  /** Bubble offset from the overlay bottom (above the attribution, or above the floating SOS). */
  speedBubbleBottom: number;
  /** The ride's next stop: draws the destination pin. */
  stop: Pick<RideStop, 'lat' | 'lng' | 'kind'> | null;
  /** My route to the stop (drawn under the markers, over the leader trail); null = nothing to draw. */
  navLine: NavLine | null;
  /** Bumps to frame me + the stop once (card tap, or after picking a stop). */
  focusStopNonce: number;
}

const CLUSTER_MAX_ZOOM = 18;
const CLUSTER_MIN_SPAN_M = 120;
const FIT_MS = 400;
const MARKER_PRESS_GUARD_MS = 400;
const MARKER_BOX = 56;
const SOS_BOX = 112;
const FAB = 52;
const TOGGLE = 48;

const toLngLatBounds = (b: Bounds): LngLatBoundsLike => [
  [b[0], b[1]],
  [b[2], b[3]],
];

const BOX_SHADOW = `0 ${MARKER_STYLE.shadow.offsetY}px ${MARKER_STYLE.shadow.radius}px rgba(11,15,20,${MARKER_STYLE.shadow.opacity})`;

/** A maplibre DOM marker whose children are React content portalled into the marker element. */
export function MapMarker({
  map,
  lat,
  lng,
  zIndex,
  onPress,
  anchor = 'center',
  children,
}: {
  map: MlMap;
  lat: number;
  lng: number;
  zIndex: number;
  onPress?: () => void;
  anchor?: 'center' | 'bottom';
  children: ReactNode;
}) {
  const [el] = useState(() => document.createElement('div'));
  const elRef = useRef(el);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const pressRef = useRef(onPress);
  useEffect(() => {
    pressRef.current = onPress;
  });

  useEffect(() => {
    elRef.current.style.zIndex = String(zIndex);
    const marker = new maplibregl.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // Position changes are applied by the effect below; creating the marker once per map/element (anchor is fixed per use).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el]);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lat, lng]);

  useEffect(() => {
    elRef.current.style.zIndex = String(zIndex);
  }, [zIndex]);

  return createPortal(
    <div
      role={onPress ? 'button' : undefined}
      style={{ cursor: onPress ? 'pointer' : 'default', pointerEvents: onPress ? 'auto' : 'none' }}
      onClick={(e) => {
        if (!pressRef.current) return;
        e.stopPropagation();
        pressRef.current();
      }}>
      {children}
    </div>,
    el,
  );
}

/**
 * Live map (06 §3, 18): same behaviour as ride-map.tsx. Navigation-style camera (`useNavCamera`):
 * follows me heading-up and tilted by default, can fit everyone, and goes free on the rider's own
 * pan or zoom (maplibre events that carry an `originalEvent`).
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
  fullMap,
  onToggleFullMap,
  overlayBottomInset,
  speedKmh,
  speedBubbleBottom,
  stop,
  navLine,
  focusStopNonce,
}: RideMapProps) {
  const { colors, scheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const lastBounds = useRef<Bounds | null>(null);
  const lastZoom = useRef<number | null>(null);
  const markerPressAt = useRef(0);
  const ridersRef = useRef(riders);
  const trailRef = useRef<{ passed: GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection; ahead: GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection }>({
    passed: lineData([]),
    ahead: lineData([]),
  });
  const navRef = useRef<{ data: GeoJSON.Feature<GeoJSON.LineString> | null; dashed: boolean }>({ data: null, dashed: false });
  const [areaH, setAreaH] = useState(0);
  const [clusterZoom, setClusterZoom] = useState(14);
  const styleUrl = useRef(colors.mapStyle);
  const tilt = usePrefsStore((s) => s.mapTilt);
  const reduceMotion = useReduceMotion();
  const callbacks = useRef({ onClearSelection, userGesture: () => {} });

  useEffect(() => {
    ridersRef.current = riders;
  });

  const adapter = useMemo<CameraAdapter | null>(
    () =>
      map
        ? {
            easeTo: ({ center, zoom, bearing, pitch, padding, durationMs, linear }) =>
              map.easeTo({
                center,
                zoom,
                bearing,
                pitch,
                padding,
                duration: durationMs,
                // maplibre-gl easing is a plain function; the default is ease-in-out cubic.
                ...(linear ? { easing: (t: number) => t } : {}),
              }),
            fitBounds: (bounds, { padding, durationMs }) =>
              map.fitBounds(toLngLatBounds(bounds), { padding, duration: durationMs, bearing: 0, pitch: 0 }),
            getZoom: () => lastZoom.current,
            getBounds: () => lastBounds.current,
          }
        : null,
    [map],
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
  useEffect(() => {
    callbacks.current = { onClearSelection, userGesture: nav.userGesture };
  });

  // Crossed part of the trail fades, the part still ahead stays bright (split at my position).
  const meLat = riders.find((r) => r.isMe)?.lat;
  const meLng = riders.find((r) => r.isMe)?.lng;
  const iAmLeader = riders.some((r) => r.isMe && r.leader);
  const trailData = useMemo(() => {
    const split = splitTrailAt(trail, meLat != null && meLng != null ? { lat: meLat, lng: meLng } : null, iAmLeader);
    return { passed: lineData(split.behind), ahead: lineData(split.ahead) };
  }, [trail, meLat, meLng, iAmLeader]);

  // Null removes the nav layers (no route); otherwise a Feature.
  const navGeoJson = useMemo(
    () => {
      if (!navLine) return null;
      const me = meLat != null && meLng != null ? { lat: meLat, lng: meLng } : null;
      return lineData(trimRouteAt(navLine.coords, me)) as GeoJSON.Feature<GeoJSON.LineString>;
    },
    [navLine, meLat, meLng],
  );
  const navDashed = navLine?.dashed ?? false;

  // The trail first, then my route, so the route layers always end up above it.
  const syncTrail = useCallback(
    (m: MlMap) => {
      syncLeaderTrailLayers(m, trailRef.current, {
        routeLine: colors.routeLine,
        routeCasing: colors.routeCasing,
        trailPassed: colors.trailPassed,
      });
      syncNavRouteLayers(m, navRef.current.data, navRef.current.dashed, {
        navRoute: colors.navRoute,
        navRouteCasing: colors.navRouteCasing,
      });
    },
    [colors.routeLine, colors.routeCasing, colors.trailPassed, colors.navRoute, colors.navRouteCasing],
  );
  const syncTrailRef = useRef(syncTrail);
  useEffect(() => {
    syncTrailRef.current = syncTrail;
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const first = ridersRef.current;
    const mine = first.find((r) => r.isMe);
    const initialBounds = fitBoundsFor(first);
    const m = new maplibregl.Map({
      container,
      style: styleUrl.current,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      ...(mine
        ? { center: [mine.lng, mine.lat] as [number, number], zoom: 16.5, pitch: followPitch(tilt) }
        : initialBounds
          ? { bounds: toLngLatBounds(initialBounds), fitBoundsOptions: { padding: { top: 104, right: 48, bottom: 76, left: 48 }, animate: false } }
          : { center: [0, 20] as [number, number], zoom: 2 }),
    });
    m.touchZoomRotate.disableRotation();
    m.touchPitch.disable();
    m.keyboard.disableRotation();

    // Camera moves started by the rider's own pointer/wheel/keys carry `originalEvent`; our eases do not.
    m.on('movestart', (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) callbacks.current.userGesture();
    });
    const onMoveEnd = () => {
      const b = m.getBounds();
      lastBounds.current = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const zoom = m.getZoom();
      lastZoom.current = zoom;
      setClusterZoom((prev) => (Math.abs(prev - zoom) >= 0.25 ? zoom : prev));
    };
    m.on('moveend', onMoveEnd);
    m.on('zoomend', onMoveEnd);
    m.on('style.load', () => syncTrailRef.current(m));
    m.on('load', () => {
      syncTrailRef.current(m);
      onMoveEnd();
    });
    m.on('click', () => {
      if (Date.now() - markerPressAt.current < MARKER_PRESS_GUARD_MS) return;
      callbacks.current.onClearSelection();
    });
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
    // The initial tilt only seeds the first frame; later changes go through the follow camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light/dark: swap the OpenFreeMap style (the trail layer is re-added on style.load).
  useEffect(() => {
    if (!map || styleUrl.current === colors.mapStyle) return;
    styleUrl.current = colors.mapStyle;
    map.setStyle(colors.mapStyle);
  }, [map, colors.mapStyle]);

  useEffect(() => {
    trailRef.current = trailData;
    navRef.current = { data: navGeoJson, dashed: navDashed };
    if (map) syncTrail(map);
  }, [map, trailData, navGeoJson, navDashed, syncTrail]);

  const markPress = useCallback(() => {
    markerPressAt.current = Date.now();
  }, []);

  const ordered = useMemo(() => drawOrder(riders, clusterZoom), [riders, clusterZoom]);

  const meRider = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders]);
  const trailStart = trail.points.length >= 2 ? trail.points[0] : null;
  const hasRiders = riders.length > 0;
  const following = nav.mode === 'follow';
  const overview = nav.mode === 'overview';
  const controlsStyle = useAnimatedStyle(() => ({ transform: [{ translateY: overlayShift.value }] }));

  const onClusterPress = (members: MapRider[]) => {
    markPress();
    if (spreadDp(members, CLUSTER_MAX_ZOOM) < CLUSTER_DP) {
      onSelect(members[0].userId);
      return;
    }
    const bounds = fitBoundsFor(members, CLUSTER_MIN_SPAN_M);
    if (!bounds || !map) return;
    nav.userGesture();
    map.fitBounds(toLngLatBounds(bounds), {
      padding: centerPadding({ areaH, topInset, bottomInset }),
      duration: FIT_MS,
    });
  };

  return (
    <View style={styles.root} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
      <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <div ref={containerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        {map
          ? ordered.map((item) => {
              if (item.kind === 'cluster') {
                return (
                  <MapMarker
                    key={item.id}
                    map={map}
                    lat={item.lat}
                    lng={item.lng}
                    zIndex={1}
                    onPress={() => onClusterPress(item.members)}>
                    <ClusterBody
                      members={item.members.length}
                      worst={item.worst}
                      meOverlaps={meCoversCluster(item, meRider, clusterZoom)}
                    />
                  </MapMarker>
                );
              }
              const r = item.rider;
              if (r.isMe) {
                return (
                  <MapMarker key={r.userId} map={map} lat={r.lat} lng={r.lng} zIndex={4}>
                    <MeMarker
                      variant="map"
                      heading={nav.myCourseDeg == null ? null : normalizeDeg(nav.myCourseDeg - nav.mapBearing)}
                      speedMps={nav.mySpeedMps}
                      accuracyM={r.accuracyM}
                      lat={r.lat}
                      zoom={clusterZoom}
                    />
                  </MapMarker>
                );
              }
              return (
                <MapMarker
                  key={r.userId}
                  map={map}
                  lat={r.lat}
                  lng={r.lng}
                  zIndex={r.status === 'sos' ? 5 : 2}
                  onPress={() => {
                    markPress();
                    onSelect(r.userId);
                  }}>
                  <RiderBody rider={r} selected={r.userId === selectedUserId} reduceMotion={reduceMotion} />
                </MapMarker>
              );
            })
          : null}
        {map && stop ? (
          <MapMarker map={map} lat={stop.lat} lng={stop.lng} zIndex={1} anchor="bottom">
            <StopPin kind={stop.kind} />
          </MapMarker>
        ) : null}
        {map && trailStart ? (
          <MapMarker map={map} lat={trailStart.lat} lng={trailStart.lng} zIndex={1}>
            <View
              style={[
                styles.startDot,
                scheme === 'dark'
                  ? { backgroundColor: colors.paper, borderColor: colors.ink }
                  : { backgroundColor: colors.ink, borderColor: colors.markerOutline },
              ]}
            />
          </MapMarker>
        ) : null}
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
            {copy['live.attribution']}
          </Text>
        </View>
        {following && speedKmh != null ? (
          <View style={[styles.speed, { bottom: speedBubbleBottom }]} pointerEvents="none">
            <SpeedBubble kmh={speedKmh} />
          </View>
        ) : null}
        {controlsHidden ? null : (
          <View style={styles.fabs} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fullMap ? copy['live.exitFullMapA11y'] : copy['live.fullMapA11y']}
              onPress={onToggleFullMap}
              style={[styles.toggle, { backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
              <Icon name={fullMap ? 'collapse' : 'expand'} color={colors.text} size={24} />
            </Pressable>
            {following ? (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={copy['live.followingA11y']}
                style={[styles.fab, { backgroundColor: colors.fabBg }, elevate('e2', scheme)]}>
                <Icon name="navigate" color={colors.brandOnBg} size={24} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy['live.recentreA11y']}
                disabled={!meRider}
                onPress={() => {
                  track('map.recentre');
                  nav.recentre();
                }}
                style={[
                  styles.pill,
                  { backgroundColor: colors.fabBg, borderColor: colors.brandOnBg, opacity: meRider ? 1 : 0.5 },
                  elevate('e2', scheme),
                ]}>
                <Icon name="centerMe" color={colors.brandOnBg} size={24} />
                <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: colors.brandOnBg }]}>
                  {copy['live.recentre']}
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy['live.fitAllA11y']}
              accessibilityState={{ selected: overview }}
              onPress={() => {
                track('map.fit_all');
                nav.showAll();
              }}
              style={[
                styles.fab,
                { backgroundColor: colors.fabBg, borderColor: colors.brandOnBg },
                elevate('e2', scheme),
                overview && styles.fabHint,
              ]}>
              <Icon name="fitPage" color={overview ? colors.brandOnBg : colors.text} size={24} />
            </Pressable>
          </View>
        )}
      </Reanimated.View>
    </View>
  );
}

const RiderBody = memo(function RiderBody({
  rider,
  selected,
  reduceMotion,
}: {
  rider: MapRider;
  selected: boolean;
  reduceMotion: boolean;
}) {
  const { colors } = useTheme();
  const sos = rider.status === 'sos';
  const box = sos ? SOS_BOX : MARKER_BOX;
  const avatar = sos ? size.avatarSos : size.avatar;
  const outer = avatar + (sos ? 12 : 8);
  return (
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
            boxShadow: BOX_SHADOW,
          },
        ]}>
        <RiderAvatar
          name={rider.name}
          colorIndex={rider.colorIndex}
          size={avatar}
          status={rider.status}
          stale={rider.stale}
          leader={rider.leader}
          ringWhenMoving={false}
          strokeWidth={MARKER_STYLE.strokeDp}
        />
      </View>
    </View>
  );
});

function SosHalo({ diameter, still }: { diameter: number; still: boolean }) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: false }),
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

function ClusterBody({ members, worst, meOverlaps }: { members: number; worst: RiderStatus; meOverlaps: boolean }) {
  const ringStatus = clusterRingStatus(worst);
  const ring = statusColors(worst);
  const ringColor = ringStatus === null ? 'transparent' : worst === 'sos' ? palette.status.sos : ring.bg;
  const outer = ringStatus ? CLUSTER_SIZE + 8 : CLUSTER_SIZE;
  return (
    <View style={[styles.markerBox, { width: MARKER_BOX + 8, height: MARKER_BOX + 8 }]}>
      <View
        style={[
          styles.clusterRing,
          { width: outer, height: outer, borderRadius: outer / 2, borderWidth: ringStatus ? MARKER_STYLE.ringDp : 0, borderColor: ringColor },
        ]}>
        <View style={styles.cluster}>
          <Text allowFontScaling={false} style={styles.clusterCount}>
            {members}
          </Text>
        </View>
      </View>
      {meOverlaps ? (
        <View style={styles.clusterCountPill}>
          <Text allowFontScaling={false} style={styles.clusterPillText}>
            {members}
          </Text>
        </View>
      ) : null}
      {ringStatus ? (
        <View style={[styles.clusterBadge, { backgroundColor: ringColor }]}>
          <Icon name={ringStatus} color={ring.fg} size={12} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  markerBox: { alignItems: 'center', justifyContent: 'center' },
  selection: { alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  halo: { position: 'absolute', backgroundColor: palette.status.sos },
  clusterRing: { alignItems: 'center', justifyContent: 'center' },
  cluster: {
    width: CLUSTER_SIZE,
    height: CLUSTER_SIZE,
    borderRadius: CLUSTER_SIZE / 2,
    backgroundColor: MARKER_STYLE.inkColor,
    borderWidth: MARKER_STYLE.strokeDp,
    borderColor: MARKER_STYLE.strokeColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: { color: MARKER_STYLE.clusterTextColor, fontSize: font.md, fontFamily: family.bold },
  clusterCountPill: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: size.avatar * 0.5,
    height: size.avatar * 0.5,
    paddingHorizontal: 4,
    borderRadius: (size.avatar * 0.5) / 2,
    backgroundColor: MARKER_STYLE.inkColor,
    borderWidth: 1.5,
    borderColor: MARKER_STYLE.strokeColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  clusterPillText: { color: MARKER_STYLE.clusterTextColor, fontSize: font.xs, fontFamily: family.bold },
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
  fabs: { position: 'absolute', right: space.md, bottom: space.md, gap: space.md, alignItems: 'flex-end' },
  fab: { width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center' },
  // 48 dp round control, centred over the 52 dp column below it.
  toggle: {
    width: TOGGLE,
    height: TOGGLE,
    borderRadius: TOGGLE / 2,
    marginRight: (FAB - TOGGLE) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speed: { position: 'absolute', left: space.md },
  pill: {
    height: FAB,
    paddingHorizontal: space.lg,
    borderRadius: FAB / 2,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pillText: { fontSize: font.md, fontFamily: family.semibold },
  fabHint: { borderWidth: 2 },
  startDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
});
