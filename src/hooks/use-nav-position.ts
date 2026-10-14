import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { navSession } from '@/lib/nav-session';

/** Some platforms report a negative value for "unknown". */
const nonNegative = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) || v < 0 ? null : v);

/**
 * My position while navigating (21 §3.6): a 1 Hz local watch whose fixes go to the engine (`navSession.ingest`).
 * Runs only while `active` and the app is in front; the watch is removed on arrival, a cleared stop, the app
 * going to the background and unmount. (Android pauses foreground watches in the background anyway; in P3 the
 * background location task feeds the same engine, and `ingest` ignores a fix it already has.)
 *
 * `timeInterval` is Android only; on iOS BestForNavigation already delivers about 1 Hz.
 */
export function useNavPosition(active: boolean): void {
  const [inFront, setInFront] = useState(() => AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setInFront(s === 'active');
      // The watch was paused meanwhile: the GPS-lost clock starts again from now.
      if (s === 'active') navSession.resume();
    });
    return () => sub.remove();
  }, []);

  const watching = active && inFront;
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (loc) => {
        if (cancelled) return;
        const c = loc.coords;
        navSession.ingest({
          lat: c.latitude,
          lng: c.longitude,
          accuracyM: nonNegative(c.accuracy),
          speedMps: nonNegative(c.speed),
          courseDeg: nonNegative(c.heading),
          t: loc.timestamp,
        });
      },
    )
      .then((s) => {
        // Removed while the watch was starting: drop it at once.
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {
        // No permission or services off: the banner says GPS lost after 10 s; the permission banner explains.
      });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watching]);
}
