import * as Location from 'expo-location';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAppInFront } from '@/hooks/use-app-in-front';
import type { LatLng } from '@/lib/geo';
import { deriveSpeed, firstFixRetryMs, nextAnchor, planningWatchWanted, type SpeedFix } from '@/lib/planning-speed';
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
  /** ms since epoch of the fix itself (the last-known answer can be up to 2 min old): the marker ages from here. */
  at: number;
  /** From the watch (or its heartbeat), not the last-known answer: only then is `speedMps` a judgement of now. */
  live: boolean;
}

/** Development only: which source delivered a fix, how old it is, and why a source failed (read in the Metro log). */
type FixSource = 'last-known' | 'watch' | 'seek' | 'heartbeat';
const devLog = (msg: string) => {
  if (__DEV__) console.log(`[planning-position] ${msg}`);
};

/** How often a still rider's fix is renewed while watching. */
const HEARTBEAT_MS = 60_000;

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
 * kept in `nav-store.origin` so the preview can route at once. `servicesEnabled` is the phone's location switch.
 * `enabled` false pauses the watch (the ride view on Home: background tracking already supplies fixes).
 */
export function usePlanningPosition(enabled = true) {
  const focused = useIsFocused();
  const [perm, setPerm] = useState<LocationPerm>({ status: 'unknown', canAskAgain: true });
  const [fix, setFix] = useState<PlanFix | null>(null);
  // Location services switched on in the phone (null = not read yet); re-read with the permission (22 §3.1.5).
  const [servicesEnabled, setServicesEnabled] = useState<boolean | null>(null);
  // The app is in the foreground: the Home screen stays "focused" while the phone is locked or the app is behind
  // another one, and the watch must not run then (22 §4.3).
  // (`useAppInFront` re-reads the state right after subscribing: no race between the first read and the listener.)
  const appActive = useAppInFront();
  const lastT = useRef(0);
  // A watch/one-shot fix has landed since this watch started (the last-known answer does not count).
  const gotLive = useRef(false);
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
    Location.hasServicesEnabledAsync()
      .then(setServicesEnabled)
      .catch(() => {});
  }, [apply]);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  /** The explicit "Allow location" tap. Resolves true when it ended up granted. */
  const request = useCallback(async (): Promise<boolean> => {
    try {
      const r = await Location.requestForegroundPermissionsAsync();
      apply(r);
      return r.status === Location.PermissionStatus.GRANTED;
    } catch {
      // The row stays; the rider can tap again.
      return false;
    }
  }, [apply]);

  const granted = perm.status === 'granted';
  useEffect(() => {
    if (!enabled || !planningWatchWanted({ focused, granted, appActive })) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    // The last-known answer is old: its position is a fine start point, but its speed says nothing about now.
    const accept = (loc: Location.LocationObject, fromLastKnown: boolean, source: FixSource) => {
      devLog(
        `${source} fix, age ${Math.round((Date.now() - loc.timestamp) / 1000)} s, accuracy ${Math.round(loc.coords.accuracy ?? -1)} m` +
          `${cancelled || loc.timestamp < lastT.current ? ' (dropped: older than the one shown)' : ''}`,
      );
      // The slow last-known answer must never replace a newer watch fix.
      if (cancelled || loc.timestamp < lastT.current) return;
      lastT.current = loc.timestamp;
      if (!fromLastKnown) gotLive.current = true;
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
        at: fromLastKnown ? loc.timestamp : Date.now(),
        live: !fromLastKnown,
      });
      useNavStore.getState().setOrigin({ lat: latitude, lng: longitude });
    };
    Location.getLastKnownPositionAsync({ maxAge: 120_000 })
      .then((loc) => {
        if (loc) accept(loc, true, 'last-known');
        else devLog('last-known: none within 2 min');
      })
      .catch((e) => devLog(`last-known failed: ${String(e)}`));
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 }, (loc) => accept(loc, false, 'watch'))
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch((e) => devLog(`watch failed: ${String(e)}`));
    // The watch alone can stay silent for minutes on a still phone whose fused cache is old (seen on a moto g64:
    // the 10 m filter never fires and the first fix never comes). A one-shot read asks the provider for a fix
    // now, so seek one at once and keep retrying (rejects or times out indoors/offline) until a live one lands.
    let seekTimer: ReturnType<typeof setTimeout> | null = null;
    const seek = (attempt: number) => {
      if (cancelled || gotLive.current) return;
      // Balanced (network and Wi-Fi) first; after two misses ask for GPS itself, which is all an emulator's `geo fix` or a
      // phone with no network can give.
      Location.getCurrentPositionAsync({ accuracy: attempt < 2 ? Location.Accuracy.Balanced : Location.Accuracy.High })
        .then((loc) => accept(loc, false, 'seek'))
        .catch((e) => {
          devLog(`seek ${attempt} failed: ${String(e)}`);
          if (!cancelled && !gotLive.current) seekTimer = setTimeout(() => seek(attempt + 1), firstFixRetryMs(attempt));
        });
    };
    seek(0);
    // A 10 m distance filter sends nothing while I stand still, which would read as "fix lost" (22 §4.4). One
    // low-effort read a minute tells "standing still" from "no GPS": the first renews the marker, the second
    // does not (it rejects or times out).
    const heartbeat = setInterval(() => {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => accept(loc, false, 'heartbeat'))
        .catch(() => {});
    }, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      if (seekTimer) clearTimeout(seekTimer);
      sub?.remove();
      // Back from the background the old anchor is too far in the past to say anything about speed.
      lastFix.current = null;
      gotLive.current = false;
    };
  }, [enabled, focused, granted, appActive]);

  return { perm, fix, request, refresh, servicesEnabled };
}
