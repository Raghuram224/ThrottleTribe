import { usePathname } from 'expo-router';
import { useEffect, useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { stopRideTracking } from '@/lib/location/tracking';
import { rideChildFor, sessionRideId } from '@/lib/routing';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useRideSessionStore } from '@/store/ride-session-store';
import { useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';

import { RideOverlays } from './ride-overlays';
import { useRideSession } from './use-ride-session';

/**
 * The single owner of the ride session, a sibling of the (app) <Stack>. It draws nothing of its own, only the
 * ride overlays, over the stack (`box-none`: touches reach the screens). Which ride it runs for is decided by
 * `sessionRideId`: the ride screen shown, else the stored lobby / active ride, so Back to Home keeps the
 * channel open. The result is published for the ride layout, which renders the header and banners from it.
 */
export function RideHost() {
  const pathname = usePathname();
  const viewRideId = useLiveUiStore((s) => s.viewRideId);
  const storeRideId = useRideStore((s) => s.rideId);
  const status = useRideStore((s) => s.ride?.status);
  const left = useRideStore((s) => !!s.myUserId && !!s.members[s.myUserId]?.leftAt);

  const child = rideChildFor(pathname, viewRideId);
  const rideId = sessionRideId({ pathname, viewRideId, storeRideId, status, left });
  const onHome = pathname === '/home' || pathname === '/home/';
  const session = useRideSession(rideId, child, onHome);

  // The ride view on Home closes once its ride's summary is in front: the screen carries the session from there. Closing it
  // earlier would release the ended ride's session before the summary has its data.
  useEffect(() => {
    if (viewRideId && rideChildFor(pathname, null) === 'summary') useLiveUiStore.getState().setViewRideId(null);
  }, [pathname, viewRideId]);

  // A ride that ended (or that I left) while no ride screen is in front: the redirect table, which stops
  // tracking, only runs on ride screens, so stop it here, once per ride and outcome.
  const over = status === 'ended' || left;
  useEffect(() => {
    if (child === null && storeRideId && over) void stopRideTracking().catch(() => {});
  }, [child, storeRideId, over]);

  // The host only unmounts when the rider signs out: the cached emergency contacts go with the account.
  useEffect(() => () => useSosStore.getState().clearContacts(), []);

  // Layout effect: the ride layout renders its screens only once it has the session, so publish before paint.
  useLayoutEffect(() => {
    useRideSessionStore.getState().setSession(session);
  });
  useLayoutEffect(() => () => useRideSessionStore.getState().setSession(null), []);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <RideOverlays session={session} />
    </View>
  );
}
