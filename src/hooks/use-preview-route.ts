import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { fetchNavRouteResult, type NavRouteResult } from '@/lib/nav-route';
import { previewState, routesForTrip, tripKey, type LastRoutes } from '@/lib/preview-state';
import { clampRetryAfterS } from '@/lib/route-limits';

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
  // The last good answer's routes, for the faded "updating" lines.
  const [last, setLast] = useState<LastRoutes | null>(null);

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
      // Alternatives are for this preview only (the choice row and the grey lines); live navigation never asks.
      { steps: true, alternatives: true, avoidMotorways: settled, context: 'preview' },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      setAnswer({ key, result });
      if (result.status === 'ok') setLast({ pair: tripKey({ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng }), routes: result.routes });
    });
    return () => controller.abort();
  }, [originLat, originLng, destLat, destLng, settled, key]);

  // A rate limit (24 §3.4): one automatic retry after `retryAfterS` (at most 60 s) while the panel is open; the manual
  // "Try again" inside that wait is scheduled for its end and shows "loading" meanwhile.
  const [waiting, setWaiting] = useState(false);
  const notBefore = useRef(0);
  const autoRetriedFor = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseKey = key.split('#')[0];
  const limitedS = answer && answer.key === key && answer.result.status === 'rate_limited' ? answer.result.retryAfterS : null;
  useEffect(() => {
    if (limitedS === null) return;
    const waitMs = clampRetryAfterS(limitedS) * 1000;
    notBefore.current = Date.now() + waitMs;
    if (autoRetriedFor.current === baseKey) return;
    autoRetriedFor.current = baseKey;
    const t = setTimeout(() => setAttempt((n) => n + 1), waitMs);
    return () => clearTimeout(t);
  }, [limitedS, baseKey]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const retry = useCallback(() => {
    const wait = notBefore.current - Date.now();
    if (timer.current) clearTimeout(timer.current);
    if (wait > 0) {
      setWaiting(true);
      timer.current = setTimeout(() => {
        setWaiting(false);
        setAttempt((n) => n + 1);
      }, wait);
    } else {
      setAttempt((n) => n + 1);
    }
  }, []);

  // Only routes of this trip: another place (or start) never shows, or seeds, the previous one's.
  const lastRoutes = routesForTrip(last, tripKey(origin, dest));
  const computed = previewState({ origin, avoid: avoidMotorways, settled, key, answer, lastRoutes });
  const state = waiting && computed.status === 'rate_limited' ? ({ status: 'loading' } as const) : computed;
  return { state, retry };
}
