import { useEffect, useRef } from 'react';

import type { LatLng } from '@/lib/geo';
import { announceArrival } from '@/lib/announce-arrival';
import { setNavRate } from '@/lib/location/tracking';
import { destKey } from '@/lib/nav-arrival';
import { pickOrigin } from '@/lib/nav-engine';
import { navSession } from '@/lib/nav-session';
import { activeSos, sosIsOn } from '@/lib/sos';
import { reportError, track } from '@/lib/telemetry';
import { createVoiceBlockSync } from '@/lib/voice-block-sync';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useNavStore } from '@/store/nav-store';
import { useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { useNavPosition } from '@/hooks/use-nav-position';

/** The engine hears "offline" only after this long (M3). */
export const OFFLINE_DEBOUNCE_MS = 3000;

interface Args {
  rideId: string | undefined;
  /** Navigation is on for this ride (lib/nav-engine `isNavActive`): starts and stops the session. */
  active: boolean;
  dest: LatLng | null;
  /** The destination's name, for the spoken prompts. */
  place: string;
  /**
   * My latest known position with its fix time (the server echo), to route from before the first local fix arrives.
   * Used only while it is at most 30 s old (`pickOrigin`).
   */
  origin: (LatLng & { t: number }) | null;
  netOffline: boolean;
  /** Foreground location permission granted and services on; without it the watch cannot start. */
  locationPermitted: boolean;
}

/**
 * Glue between the ride screens and the engine (21 §3 intro). Mounted in the ride layout: it starts the session
 * when navigation turns on (or the destination changes), stops it when it turns off or the screens go, tells it
 * about the network, and runs the 1 Hz foreground watch. The engine itself is `lib/nav-session.ts` (no React);
 * screens read its state from `nav-store.engine`.
 */
export function useNavigation({ rideId, active, dest, place, origin, netOffline, locationPermitted }: Args): void {
  const originRef = useRef(origin);
  const offlineRef = useRef(netOffline);
  const placeRef = useRef(place);
  // The last local fix of the session that just ended: a destination change routes from it, not from the 5 s echo.
  const lastLocalRef = useRef<(LatLng & { t: number }) | null>(null);
  useEffect(() => {
    originRef.current = origin;
    offlineRef.current = netOffline;
    placeRef.current = place;
  });

  // Telemetry and haptics are app services; the engine only calls these.
  useEffect(() => {
    navSession.setEffects({
      // One shared claim: the live screen's own latch may get there first, and must not announce it twice.
      onArrived: ({ rideId: id, key }) => announceArrival(id, key),
      onRerouted: () => track('nav.rerouted'),
      onRouteFailed: (code) => track('nav.route_failed', { code }),
      onVoiceSkipped: () => track('nav.voice_skipped', { reason: 'session' }),
    });
    return () => navSession.setEffects(null);
  }, []);

  // Voice stays silent while muted or during any SOS (mine, the hold, or one received): the engine is told on every
  // change of those stores, whatever the app is doing (background included), and stops speaking at once (21 §4.3).
  useEffect(() => {
    // These run inside the stores' own `set`: a voice bug is reported, never thrown into an SOS send or receive.
    const apply = createVoiceBlockSync(
      () => ({
        voiceOn: useNavStore.getState().voiceOn,
        mySosOn: sosIsOn(useSosStore.getState().phase),
        sosHolding: useLiveUiStore.getState().sosHolding,
        receivedSos:
          activeSos(Object.values(useRideStore.getState().members), useRideStore.getState().myUserId).length > 0,
      }),
      (blocked) => navSession.setVoiceBlocked(blocked),
      (e) => reportError(e, { extra: { op: 'voice_block' } }),
    );
    apply();
    const unsubs = [
      useNavStore.subscribe(apply),
      useSosStore.subscribe(apply),
      useLiveUiStore.subscribe(apply),
      useRideStore.subscribe(apply),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // While navigating the location task runs at 1 s (Android); back to 5 s when it ends (arrival, stop cleared, leaving).
  useEffect(() => {
    void setNavRate(active);
    return () => {
      void setNavRate(false);
    };
  }, [active]);

  // A clock beat so "GPS signal lost" can be said when the fixes stop altogether (no fix means no ingest).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => navSession.tick(), 2000);
    return () => clearInterval(id);
  }, [active]);

  const destLat = dest?.lat;
  const destLng = dest?.lng;
  useEffect(() => {
    if (!active || !rideId || destLat === undefined || destLng === undefined) return;
    const to = { lat: destLat, lng: destLng };
    const key = destKey(to);
    const seeded = useNavStore.getState().seeded;
    const nav = useNavStore.getState();
    const now = Date.now();
    navSession.start({
      rideId,
      dest: to,
      place: placeRef.current,
      // The preview's route for this exact destination: no second request on Go.
      seed: seeded && seeded.key === key ? seeded.route : null,
      // The freshest known position, at most 30 s old: a cold start never routes from a stale echo (it waits for
      // the first local fix), and a changed destination starts from the last local fix, not the 5 s echo.
      origin: pickOrigin(
        [lastLocalRef.current, originRef.current, nav.origin ? { ...nav.origin, t: nav.originAt } : null],
        now,
      ),
      offline: offlineRef.current,
    });
    return () => {
      lastLocalRef.current = navSession.getState().fix;
      navSession.stop();
    };
  }, [active, rideId, destLat, destLng]);

  // Going offline reaches the engine after 3 s; coming back reaches it at once. A flapping signal then never
  // looks like a series of reconnects (each of which would otherwise be a chance to fire a request).
  useEffect(() => {
    if (!netOffline) {
      navSession.setOffline(false);
      return;
    }
    const id = setTimeout(() => navSession.setOffline(true), OFFLINE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [netOffline]);

  useNavPosition(active && locationPermitted);
}
