import { useEffect, useMemo, useRef, useState } from 'react';

import { haversineM, type LatLng } from '@/lib/geo';
import { destKey } from '@/lib/nav-arrival';
import {
  ARRIVED_WITHIN_M,
  fetchNavRoute,
  remainingToStop,
  shouldReroute,
  type NavRoute,
} from '@/lib/nav-route';
import { useNavStore } from '@/store/nav-store';

export interface NavRouteState {
  /** The road route, or null while loading / when routing failed. */
  route: NavRoute | null;
  /** Dashed fallback line [me, stop] when there is no road route; empty without a stop or position. */
  straightLine: LatLng[];
  /** Distance still to go (along the road, or straight line when `approximate`). Null without a stop/position. */
  distanceM: number | null;
  /** ETA in seconds; null when only a straight line is known. */
  durationS: number | null;
  approximate: boolean;
  arrived: boolean;
}

/**
 * Keeps my route to the ride's stop fresh: fetches when the stop changes, then again when I am more
 * than 150 m off the line (at most once per 60 s). Never blocks the UI; a failed fetch just means
 * the straight-line fallback until the next allowed try.
 */
export function useNavRoute(
  me: LatLng | null,
  stop: LatLng | null,
  /** Expressway avoidance for every fetch (the choice made on the route preview, 21). */
  avoidMotorways = false,
): NavRouteState {
  const stopKey = destKey(stop);
  // The preview's route for this stop (21 §2.3): used as-is, so starting a ride costs no second request.
  const seeded = useNavStore((s) => s.seeded);
  const seededRoute = seeded && seeded.key === stopKey ? seeded.route : null;
  const [fetched, setFetched] = useState<{ key: string; route: NavRoute | null }>({ key: '', route: null });
  const route = fetched.key === stopKey ? fetched.route : seededRoute;
  const avoidRef = useRef(avoidMotorways);
  useEffect(() => {
    avoidRef.current = avoidMotorways;
  }, [avoidMotorways]);

  const routeRef = useRef<NavRoute | null>(null);
  const lastFetchAt = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const lastKey = useRef('');
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const meLat = me?.lat;
  const meLng = me?.lng;
  const stopLat = stop?.lat;
  const stopLng = stop?.lng;
  useEffect(() => {
    if (stopLat === undefined || stopLng === undefined) {
      inFlight.current?.abort();
      inFlight.current = null;
      lastKey.current = '';
      lastFetchAt.current = 0;
      return;
    }
    if (meLat === undefined || meLng === undefined) return;
    const key = `${stopLat},${stopLng}`;
    const changed = key !== lastKey.current;
    if (changed) {
      inFlight.current?.abort();
      inFlight.current = null;
      lastKey.current = key;
      // A seeded route counts as just fetched (no request until I am off it); otherwise fetch at once.
      const seed = useNavStore.getState().seeded;
      const fresh = seed && seed.key === key ? seed.route : null;
      lastFetchAt.current = fresh ? Date.now() : 0;
      routeRef.current = fresh;
    }
    if (inFlight.current) return;
    const now = Date.now();
    if (!shouldReroute({ lat: meLat, lng: meLng }, routeRef.current, lastFetchAt.current, now)) return;
    const controller = new AbortController();
    inFlight.current = controller;
    lastFetchAt.current = now;
    const from = { lat: meLat, lng: meLng };
    const to = { lat: stopLat, lng: stopLng };
    fetchNavRoute(from, to, { avoidMotorways: avoidRef.current }, controller.signal).then((r) => {
      if (controller.signal.aborted) return;
      inFlight.current = null;
      // A failed re-route keeps the old line (the seeded one included): better than a straight one.
      const seed = useNavStore.getState().seeded;
      const old = seed && seed.key === key ? seed.route : null;
      setFetched((prev) => ({ key, route: r ?? (prev.key === key ? prev.route : old) }));
    });
  }, [meLat, meLng, stopLat, stopLng]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  return useMemo(() => {
    if (!me || !stop) {
      return { route, straightLine: [], distanceM: null, durationS: null, approximate: true, arrived: false };
    }
    const rem = remainingToStop(me, stop, route);
    return {
      route,
      straightLine: route ? [] : [me, stop],
      distanceM: rem.distanceM,
      durationS: rem.durationS,
      approximate: rem.approximate,
      arrived: haversineM(me, stop) < ARRIVED_WITHIN_M,
    };
  }, [me, stop, route]);
}
