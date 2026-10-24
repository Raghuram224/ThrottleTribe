import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useWindowDimensions } from 'react-native';

import type { MapHandle } from '@/components/map/types';
import type { LatLng } from '@/lib/geo';
import { fitBoundsFor, type Bounds } from '@/lib/map-fit';
import { fallbackPadding, HOME_FALLBACK_CAMERA, HOME_ME_ZOOM, type CameraIntent } from '@/lib/plan-flow';
import type { PreviewPadding } from '@/lib/preview-fit';

const FIT_MS = 400;
const PLACE_MS = 400;
const FOLLOW_MS = 450;
/** Without a start point the pin shows at street level. */
const PIN_ONLY_ZOOM = 14;
/** Below this the map is showing a country or the world, not where I am: the first fix zooms in. */
const FOLLOW_MIN_ZOOM = 10;

interface Args {
  mapRef: RefObject<MapHandle | null>;
  /** The planning scene is the one on screen. Another scene's camera (the ride view's) must not be fought: nothing moves while false. */
  active?: boolean;
  me: { lat: number; lng: number } | null;
  place: { lat: number; lng: number } | null;
  /** What a 'fit' intent frames: every route, or every search result (a pure helper in lib/preview-fit decides). */
  fitPoints: readonly LatLng[];
  /** Everything floating over the map is counted here (the 20 C2 rule): bar, chips, sheet or panel, attribution. */
  padding: PreviewPadding;
  intent: CameraIntent;
  intentNonce: number;
  /** No fix, no saved camera, no touch yet: frame India in the map the sheet leaves visible (22 §4.2, audit 4). */
  frameFallback: boolean;
  /** Browse: the camera follows each fix (22 §4.2 "Centred"). */
  follow: boolean;
  /** The last zoom the map came to rest at (the first frame's zoom until then). */
  getZoom: () => number;
}

/**
 * The map home's browse camera (22 §4.2): intents (me, place, fit, restore), following each fix, and the stand-in India
 * frame. North-up and flat, so every move sets bearing and pitch to 0. It drives the map through its handle and only
 * while `active`: when the ride view takes the map, its navigation camera is the only one that moves it, and when the
 * plan scene comes back its intent (a 'restore' of the browse camera) runs again.
 */
export function usePlanCamera({ mapRef, active = true, me, place, fitPoints, padding, intent, intentNonce, frameFallback, follow, getZoom }: Args) {
  const win = useWindowDimensions();
  const bounds = useMemo<Bounds | null>(() => fitBoundsFor([...fitPoints]), [fitPoints]);

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
    if (!cam || !active) return;
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
    // `key` stands for the intent, what it frames and the padding; `active` for the scene coming back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  // The scene just came back: a 'restore' of the browse camera runs, and the follow ease below must not override it.
  const wasActive = useRef(active);

  // Centred: follow each fix, zoom kept (except from a country-level frame, which is not "where I am").
  const meLat = me?.lat;
  const meLng = me?.lng;
  useEffect(() => {
    if (!active || !follow || meLat === undefined || meLng === undefined) return;
    if (!wasActive.current && intent.kind === 'restore') return;
    mapRef.current?.easeTo({
      center: [meLng, meLat],
      zoom: getZoom() < FOLLOW_MIN_ZOOM ? HOME_ME_ZOOM : undefined,
      padding,
      durationMs: FOLLOW_MS,
      bearing: 0,
      pitch: 0,
    });
    // `pad` stands for the padding: the marker stays centred in the part of the map that is visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, follow, meLat, meLng, pad]);

  // The stand-in India view ignores the sheet (it covers most of the first-run screen), so its centre is moved into
  // the strip the sheet leaves, once the sheet's height is known and when it changes, until a fix or a touch.
  useEffect(() => {
    if (!active || !frameFallback) return;
    const f = HOME_FALLBACK_CAMERA;
    mapRef.current?.easeTo({
      center: [f.lng, f.lat],
      zoom: f.zoom,
      padding: fallbackPadding(padding, win.height),
      durationMs: FIT_MS,
      bearing: 0,
      pitch: 0,
    });
    // `pad` stands for the padding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, frameFallback, pad, win.height]);

  useEffect(() => {
    wasActive.current = active;
  });
}
