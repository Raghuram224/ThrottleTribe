import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { fetchNavRouteResult, type NavRoute, type NavRouteResult } from '@/lib/nav-route';
import { previewState } from '@/lib/preview-state';

export type { PreviewRouteState } from '@/lib/preview-state';

/** The switch is read after it has rested this long, so rapid toggles send one request (21 §2.3.1). */
export const AVOID_SETTLE_MS = 500;

/**
 * The route shown on the preview (21 §2.3). One request per (origin, destination, settled expressway choice,
 * retry); changing the switch refetches after it has rested 500 ms, and an older answer never overwrites a
 * newer question. While a change is pending or in flight the previous route stays (`updating`). Never throws.
 */
export function usePreviewRoute(origin: LatLng | null, dest: LatLng, avoidMotorways: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState(avoidMotorways);
  const [answer, setAnswer] = useState<{ key: string; result: NavRouteResult } | null>(null);
  // The last good route, for the faded "updating" line.
  const [lastRoute, setLastRoute] = useState<NavRoute | null>(null);

  // A toggle and toggle-back inside the window never leaves `settled`, so it sends nothing.
  useEffect(() => {
    if (avoidMotorways === settled) return;
    const timer = setTimeout(() => setSettled(avoidMotorways), AVOID_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [avoidMotorways, settled]);

  const key = origin ? `${origin.lat},${origin.lng}|${dest.lat},${dest.lng}|${settled ? 'a' : ''}#${attempt}` : '';

  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const destLat = dest.lat;
  const destLng = dest.lng;
  useEffect(() => {
    if (originLat === undefined || originLng === undefined) return;
    const controller = new AbortController();
    fetchNavRouteResult(
      { lat: originLat, lng: originLng },
      { lat: destLat, lng: destLng },
      // Steps are asked for once, here: the live ride reuses this route (seeded at Go), so Go sends no second request.
      { steps: true, avoidMotorways: settled },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      setAnswer({ key, result });
      if (result.status === 'ok') setLastRoute(result.route);
    });
    return () => controller.abort();
  }, [originLat, originLng, destLat, destLng, settled, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const state = previewState({ origin, avoid: avoidMotorways, settled, key, answer, lastRoute });
  return { state, retry };
}
