import { Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapLibreMap } from '@/components/map/maplibre-map';
import type { MapHandle, MapLine } from '@/components/map/types';
import { MeMarker } from '@/components/me-marker';
import { StopPin } from '@/components/stop-pin';
import { fitBoundsFor, type Bounds } from '@/lib/map-fit';
import { HOME_ME_ZOOM, type CameraIntent, type PlanCamera } from '@/lib/plan-flow';
import { previewFitPoints, type PreviewPadding } from '@/lib/preview-fit';
import type { StopKind } from '@/lib/ride-api';
import { NAV_CASING_WIDTH, NAV_ROUTE_SOURCE_ID, NAV_ROUTE_WIDTH } from '@/lib/route-style';
import type { NavLine } from '@/lib/stop-ui';
import { useTheme } from '@/theme/use-theme';

export interface PlanMapProps {
  me: { lat: number; lng: number; accuracyM: number | null } | null;
  /** The pin: the place sheet and the route (null in browse). */
  place: { lat: number; lng: number; kind: StopKind } | null;
  /** The road route (solid), the dashed straight line, or nothing yet. Route mode only. */
  line: NavLine | null;
  /** The line is the previous route while a new one loads: drawn at 0.4 opacity (21 §2.3 "Updating"). */
  faded?: boolean;
  /** Everything floating over the map is counted here (the 20 C2 rule): bar, chips, sheet or panel, attribution. */
  padding: PreviewPadding;
  intent: CameraIntent;
  intentNonce: number;
  /** The first frame, no animation. */
  initial: PlanCamera;
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

const FIT_MS = 400;
const PLACE_MS = 400;
const FOLLOW_MS = 450;
/** Without a start point the pin shows at street level. */
const PIN_ONLY_ZOOM = 14;
/** Below this the map is showing a country or the world, not where I am: the first fix zooms in. */
const FOLLOW_MIN_ZOOM = 10;

/**
 * The map home's one map (22 §2.2): the route preview map, extended with a browse camera (follow / free,
 * saved camera, intents). North-up, pan and zoom allowed, no rotate or pitch. Same route, casing, pin and
 * "me" marker as the live map, so a destination looks the same on Home, the preview and live.
 */
export function PlanMap({
  me,
  place,
  line,
  faded = false,
  padding,
  intent,
  intentNonce,
  initial,
  follow,
  onUserGesture,
  onIdle,
  onMapError,
  onMapPress,
}: PlanMapProps) {
  const { colors } = useTheme();
  const mapRef = useRef<MapHandle>(null);
  const zoomRef = useRef(initial.zoom);

  const points = useMemo(() => (place ? previewFitPoints(line, me, place) : []), [line, me, place]);
  const bounds = useMemo<Bounds | null>(() => fitBoundsFor(points), [points]);
  // The first frame only: later changes to `initial` are ignored on purpose (the camera moves by intents).
  const [initialCamera] = useState(() => ({ center: [initial.lng, initial.lat] as [number, number], zoom: initial.zoom }));

  // Intents: what the camera frames or the room around it changed. Not on every GPS tick (`me` only matters
  // for a 'me' intent, whose nonce changes on purpose).
  const pad = `${padding.top}|${padding.bottom}|${padding.left}`;
  const key =
    intent.kind === 'me' || intent.kind === 'none'
      ? `${intent.kind}#${intentNonce}`
      : intent.kind === 'fit'
        ? `fit#${intentNonce}|${bounds ? bounds.map((b) => b.toFixed(4)).join(',') : place ? `${place.lat},${place.lng}` : ''}|${pad}`
        : intent.kind === 'place'
          ? `place#${intentNonce}|${place?.lat},${place?.lng}|${pad}`
          : `restore#${intentNonce}`;
  useEffect(() => {
    const cam = mapRef.current;
    if (!cam) return;
    if (intent.kind === 'me') {
      if (me) cam.easeTo({ center: [me.lng, me.lat], zoom: intent.zoom, padding, durationMs: FOLLOW_MS, bearing: 0, pitch: 0 });
    } else if (intent.kind === 'place') {
      if (place) cam.easeTo({ center: [place.lng, place.lat], zoom: intent.zoom, padding, durationMs: PLACE_MS, bearing: 0, pitch: 0 });
    } else if (intent.kind === 'fit') {
      if (bounds) cam.fitBounds(bounds, { padding, durationMs: FIT_MS });
      else if (place) cam.easeTo({ center: [place.lng, place.lat], zoom: PIN_ONLY_ZOOM, padding, durationMs: FIT_MS, bearing: 0, pitch: 0 });
    } else if (intent.kind === 'restore') {
      const c = intent.camera;
      cam.easeTo({ center: [c.lng, c.lat], zoom: c.zoom, padding: { top: 0, right: 0, bottom: 0, left: 0 }, durationMs: PLACE_MS, bearing: 0, pitch: 0 });
    }
    // `key` stands for the intent, what it frames and the padding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Centred: follow each fix, zoom kept (except from a country-level frame, which is not "where I am").
  const meLat = me?.lat;
  const meLng = me?.lng;
  useEffect(() => {
    if (!follow || meLat === undefined || meLng === undefined) return;
    mapRef.current?.easeTo({
      center: [meLng, meLat],
      zoom: zoomRef.current < FOLLOW_MIN_ZOOM ? HOME_ME_ZOOM : undefined,
      padding,
      durationMs: FOLLOW_MS,
      bearing: 0,
      pitch: 0,
    });
    // `pad` stands for the padding: the marker stays centred in the part of the map that is visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, meLat, meLng, pad]);

  const dashed = line?.dashed ?? false;
  const opacity = faded ? 0.4 : 1;
  const lines = useMemo<MapLine[]>(() => {
    const route = { color: colors.navRoute, width: NAV_ROUTE_WIDTH, opacity };
    const casing = { color: colors.navRouteCasing, width: NAV_CASING_WIDTH, opacity };
    return [
      {
        id: NAV_ROUTE_SOURCE_ID,
        coords: line?.coords ?? [],
        dashed,
        beforeId: colors.routeBeforeId,
        // The straight-line fallback has no casing (21 §2.3).
        layers: dashed ? [route] : [casing, route],
      },
    ];
  }, [line, dashed, opacity, colors.navRoute, colors.navRouteCasing, colors.routeBeforeId]);

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
        {place ? (
          <Marker id="plan-stop" lngLat={[place.lng, place.lat]} anchor="bottom">
            <StopPin kind={place.kind} />
          </Marker>
        ) : null}
        {me ? (
          <Marker id="plan-me" lngLat={[me.lng, me.lat]}>
            <MeMarker variant="map" heading={null} accuracyM={me.accuracyM} lat={me.lat} zoom={15} />
          </Marker>
        ) : null}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
