// Navigation-style camera for the live map, shared by the native (MapLibre RN) and web (maplibre-gl)
// maps. The maps only supply a small imperative adapter; all decisions live here and in
// `lib/nav-camera.ts`. Modes: follow (default) / overview (fit all riders) / free (rider moved the map).
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { deriveMotion, effectiveMotion, pushFix, type Fix } from '@/lib/own-motion';
import type { LatLng } from '@/lib/geo';
import { anyOutside, fitBoundsFor, type Bounds } from '@/lib/map-fit';
import {
  centerPadding,
  effectiveMode,
  followPadding,
  followPitch,
  INITIAL_BEARING,
  FOLLOW_EASE_MS,
  overviewPadding,
  reduceCamera,
  smoothZoom,
  stepBearing,
  zoomForSpeed,
  type BearingState,
  type CameraMode,
  type Insets,
  type PaddingPx,
} from '@/lib/nav-camera';

export interface NavRider {
  userId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  /** Fix time in ms; with it my course and speed can be derived from consecutive positions. */
  recordedAtMs?: number | null;
  isMe: boolean;
}

export interface CameraAdapter {
  easeTo(o: {
    center: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
    padding: PaddingPx;
    durationMs: number;
    linear?: boolean;
  }): void;
  /** Fit north-up and flat (bearing 0, pitch 0). */
  fitBounds(bounds: Bounds, o: { padding: PaddingPx; durationMs: number }): void;
  getZoom(): number | null;
  getBounds(): Bounds | null;
}

interface Args {
  riders: NavRider[];
  /** Map area height in dp (0 until laid out). */
  areaH: number;
  /** Chrome over the top of the map. */
  topInset: number;
  /** Visible height of the bottom sheet over the map (value at the last snap). */
  bottomInset: number;
  selectedUserId: string | null;
  /** Bumps on every selection (row, marker, banner): eases to that rider and goes free. */
  focusNonce: number;
  adapter: CameraAdapter | null;
  tilt: boolean;
  reduceMotion: boolean;
  /** The ride's next stop (19 A); `stopFocusNonce` bumps ask for one fit of [me, stop]. */
  stop?: LatLng | null;
  stopFocusNonce?: number;
}

/** A stop focus waits this long for the stop to arrive (the leader's own pick comes back by broadcast). */
const STOP_FOCUS_WAIT_MS = 5000;
const RECENTRE_MS = 450;
const FIT_MS = 400;
const AUTO_FIT_CHECK_MS = 2000;
const FOCUS_MIN_ZOOM = 15;

interface Nav {
  key: string;
  lat: number;
  lng: number;
  zoom: number | null;
  bearing: BearingState;
  history: Fix[];
  courseDeg: number | null;
  speedKmh: number | null;
}

export function useNavCamera({
  riders,
  areaH,
  topInset,
  bottomInset,
  selectedUserId,
  focusNonce,
  adapter,
  tilt,
  reduceMotion,
  stop = null,
  stopFocusNonce = 0,
}: Args) {
  const [mode, dispatch] = useReducer(reduceCamera, 'follow' as CameraMode);
  const me = riders.find((r) => r.isMe) ?? null;
  const eff = effectiveMode(mode, me !== null);

  // Zoom and bearing evolve with each position change. Derived during render (guarded by the key), so
  // no effect has to set state.
  const meKey = me ? `${me.lat}|${me.lng}|${me.speedMps}|${me.heading}|${me.recordedAtMs ?? ''}` : '';
  const [nav, setNav] = useState<Nav>({ key: '', lat: 0, lng: 0, zoom: null,
    bearing: INITIAL_BEARING,
    history: [],
    courseDeg: null,
    speedKmh: null,
  });
  if (nav.key !== meKey) {
    if (me) {
      const history =
        me.recordedAtMs != null ? pushFix(nav.history, { lat: me.lat, lng: me.lng, t: me.recordedAtMs }) : nav.history;
      const motion = effectiveMotion(me, deriveMotion(history));
      setNav({
        key: meKey,
        lat: me.lat,
        lng: me.lng,
        zoom: smoothZoom(nav.zoom, zoomForSpeed(motion.speedKmh)),
        bearing: stepBearing(nav.bearing, { courseDeg: motion.courseDeg, speedKmh: motion.speedKmh }),
        history,
        courseDeg: motion.courseDeg,
        speedKmh: motion.speedKmh,
      });
    } else {
      setNav({ ...nav, key: meKey });
    }
  }

  // A new selection means "look at that rider": free camera.
  const [seenNonce, setSeenNonce] = useState(0);
  if (seenNonce !== focusNonce) {
    setSeenNonce(focusNonce);
    if (selectedUserId) dispatch({ type: 'focusRider' });
  }

  // Framing me + the stop is a "look here" move too: free camera until Re-centre.
  const [seenStopNonce, setSeenStopNonce] = useState(stopFocusNonce);
  if (seenStopNonce !== stopFocusNonce) {
    setSeenStopNonce(stopFocusNonce);
    dispatch({ type: 'focusRider' });
  }

  const insets: Insets = { areaH, topInset, bottomInset };
  const latest = useRef({ riders, insets, selectedUserId, tilt, reduceMotion, stop });
  useEffect(() => {
    latest.current = { riders, insets, selectedUserId, tilt, reduceMotion, stop };
  });

  // ---- follow
  const wasFollowing = useRef(false);
  const lastNavKey = useRef('');
  const applied = useRef(false);
  useEffect(() => {
    if (eff !== 'follow' || !adapter || areaH <= 0 || nav.key === '') {
      if (eff !== 'follow') wasFollowing.current = false;
      return;
    }
    // A GPS update eases linearly for ~1 s; entering follow or a padding change (sheet moved) eases 450 ms.
    const isUpdate = wasFollowing.current && lastNavKey.current !== nav.key;
    adapter.easeTo({
      center: [nav.lng, nav.lat],
      zoom: nav.zoom ?? undefined,
      bearing: nav.bearing.bearing,
      pitch: followPitch(tilt),
      padding: followPadding({ areaH, topInset, bottomInset }),
      durationMs: reduceMotion || !applied.current ? 0 : isUpdate ? FOLLOW_EASE_MS : RECENTRE_MS,
      linear: isUpdate,
    });
    applied.current = true;
    wasFollowing.current = true;
    lastNavKey.current = nav.key;
  }, [eff, adapter, nav, areaH, topInset, bottomInset, tilt, reduceMotion]);

  // ---- overview
  const fit = useCallback(
    (durationMs: number) => {
      const { riders: pts, insets: ins } = latest.current;
      const bounds = fitBoundsFor(pts);
      if (!bounds || !adapter || ins.areaH <= 0) return;
      adapter.fitBounds(bounds, { padding: overviewPadding(ins), durationMs });
    },
    [adapter],
  );
  const hasRiders = riders.length > 0;
  useEffect(() => {
    if (eff !== 'overview' || !hasRiders) return;
    fit(latest.current.reduceMotion ? 0 : applied.current ? RECENTRE_MS : 0);
    applied.current = true;
  }, [eff, hasRiders, fit, areaH, topInset, bottomInset]);
  // Overview keeps everyone in view as they spread out.
  useEffect(() => {
    if (eff !== 'overview' || !adapter) return;
    const id = setInterval(() => {
      const view = adapter.getBounds();
      const pts = latest.current.riders;
      if (view && pts.length > 0 && anyOutside(pts, view)) fit(latest.current.reduceMotion ? 0 : FIT_MS);
    }, AUTO_FIT_CHECK_MS);
    return () => clearInterval(id);
  }, [eff, adapter, fit]);

  // ---- focus a rider
  useEffect(() => {
    if (!adapter) return;
    const { riders: pts, insets: ins, selectedUserId: sel, reduceMotion: reduce } = latest.current;
    const target = pts.find((r) => r.userId === sel);
    if (!target) return;
    adapter.easeTo({
      center: [target.lng, target.lat],
      zoom: Math.max(FOCUS_MIN_ZOOM, adapter.getZoom() ?? FOCUS_MIN_ZOOM),
      padding: centerPadding(ins),
      durationMs: reduce ? 0 : FIT_MS,
    });
  }, [focusNonce, adapter]);

  // ---- frame me + the stop, once per request
  const initialStopNonce = useRef(stopFocusNonce);
  const stopFocusUntil = useRef(0);
  const frameStop = useCallback(() => {
    if (!adapter || Date.now() > stopFocusUntil.current) return;
    const { riders: pts, insets: ins, stop: target, reduceMotion: reduce } = latest.current;
    if (!target || ins.areaH <= 0) return;
    const mine = pts.find((r) => r.isMe);
    const bounds = fitBoundsFor(mine ? [mine, target] : [target]);
    if (!bounds) return;
    stopFocusUntil.current = 0;
    adapter.fitBounds(bounds, { padding: overviewPadding(ins), durationMs: reduce ? 0 : FIT_MS });
  }, [adapter]);
  useEffect(() => {
    if (stopFocusNonce === initialStopNonce.current) return;
    stopFocusUntil.current = Date.now() + STOP_FOCUS_WAIT_MS;
    frameStop();
  }, [stopFocusNonce, frameStop]);
  const stopLat = stop?.lat;
  const stopLng = stop?.lng;
  useEffect(() => {
    frameStop();
  }, [stopLat, stopLng, areaH, frameStop]);

  const recentre = useCallback(() => dispatch({ type: 'recenter' }), []);
  const showAll = useCallback(() => dispatch({ type: 'showAll' }), []);
  /** The rider moved the map (or a cluster tap moved it for them): stop auto camera moves. */
  const userGesture = useCallback(() => dispatch({ type: 'gesture' }), []);

  return {
    mode: eff,
    /** Current map bearing, for rotating my arrow relative to the heading-up map. */
    /** My effective course (derived from my positions, else GPS) and speed: use these for my marker. */
    myCourseDeg: nav.courseDeg,
    mySpeedMps: nav.speedKmh == null ? null : nav.speedKmh / 3.6,
    mapBearing: eff === 'overview' ? 0 : nav.bearing.bearing,
    recentre,
    showAll,
    userGesture,
  };
}
