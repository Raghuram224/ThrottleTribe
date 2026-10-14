import * as Location from 'expo-location';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { LatLng } from '@/lib/geo';
import { deriveSpeed, nextAnchor, type SpeedFix } from '@/lib/planning-speed';
import { useNavStore } from '@/store/nav-store';

export interface PlanFix extends LatLng {
  accuracyM: number | null;
  /** Reported, else derived from the last two fixes (planning-speed); null = no evidence. */
  speedMps: number | null;
  /**
   * ms since epoch when the app received the speed evidence (the phone's clock now, not the fix's own
   * timestamp, which may be skewed). The typing lock treats evidence older than 10 s as none.
   */
  t: number;
}

export interface LocationPerm {
  /** `unknown` until the first read. */
  status: 'unknown' | 'granted' | 'denied' | 'undetermined';
  /** False once the OS will not ask again: the only way forward is system settings. */
  canAskAgain: boolean;
}

/**
 * Position for the pre-ride screens (Where to?, route preview; 21 §2.2): the foreground permission, an
 * instant last-known fix (up to 2 min old), then a Balanced watch every 10 m while the screen is focused.
 * Nothing is requested on its own: `request()` is the explicit "Allow location" tap. The latest fix is also
 * kept in `nav-store.origin` so the preview can route at once.
 */
export function usePlanningPosition() {
  const focused = useIsFocused();
  const [perm, setPerm] = useState<LocationPerm>({ status: 'unknown', canAskAgain: true });
  const [fix, setFix] = useState<PlanFix | null>(null);
  const lastT = useRef(0);
  const lastFix = useRef<SpeedFix | null>(null);
  // The last speed we had real evidence for, held across fixes that carry none (a too-short gap, a poor fix).
  const evidence = useRef<{ speedMps: number; t: number } | null>(null);

  const apply = useCallback((r: Location.LocationPermissionResponse) => {
    setPerm({
      status: r.status === Location.PermissionStatus.GRANTED ? 'granted' : r.status === Location.PermissionStatus.DENIED ? 'denied' : 'undetermined',
      canAskAgain: r.canAskAgain,
    });
  }, []);

  // Re-read on mount and when the app returns from system settings.
  const refresh = useCallback(() => {
    Location.getForegroundPermissionsAsync()
      .then(apply)
      .catch(() => {
        // Leave the last known answer.
      });
  }, [apply]);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const request = useCallback(async () => {
    try {
      apply(await Location.requestForegroundPermissionsAsync());
    } catch {
      // The row stays; the rider can tap again.
    }
  }, [apply]);

  const granted = perm.status === 'granted';
  useEffect(() => {
    if (!focused || !granted) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    // The last-known answer is old: its position is a fine start point, but its speed says nothing about now.
    const accept = (loc: Location.LocationObject, fromLastKnown: boolean) => {
      // The slow last-known answer must never replace a newer watch fix.
      if (cancelled || loc.timestamp < lastT.current) return;
      lastT.current = loc.timestamp;
      const { latitude, longitude, accuracy, speed } = loc.coords;
      const cur: SpeedFix = {
        lat: latitude,
        lng: longitude,
        accuracyM: accuracy ?? null,
        speedMps: fromLastKnown ? null : speed,
        takenAt: loc.timestamp,
      };
      const derived = deriveSpeed(lastFix.current, cur);
      lastFix.current = nextAnchor(lastFix.current, cur);
      if (derived != null) evidence.current = { speedMps: derived, t: Date.now() };
      const ev = evidence.current;
      setFix({
        lat: latitude,
        lng: longitude,
        accuracyM: cur.accuracyM,
        speedMps: ev ? ev.speedMps : null,
        t: ev ? ev.t : Date.now(),
      });
      useNavStore.getState().setOrigin({ lat: latitude, lng: longitude });
    };
    Location.getLastKnownPositionAsync({ maxAge: 120_000 })
      .then((loc) => loc && accept(loc, true))
      .catch(() => {});
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (loc) => accept(loc, false))
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [focused, granted]);

  return { perm, fix, request, refresh };
}
