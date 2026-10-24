import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { RideHost } from '@/components/ride/ride-host';
import { Screen } from '@/components/screen';
import { href } from '@/lib/nav';
import { useSessionStore } from '@/store/session-store';

/** Guard: no session or no profile sends the rider to onboarding. */
export default function AppLayout() {
  const ready = useSessionStore((s) => s.ready);
  // "Signed in" = a session is stored; a failed refresh (no signal) must never bounce the rider out.
  const signedIn = useSessionStore((s) => s.signedIn);
  const profile = useSessionStore((s) => s.profile);
  const profileLoaded = useSessionStore((s) => s.profileLoaded);
  // Offline with a cached session: render anyway, screens show their own offline state.
  const [loadFailed, setLoadFailed] = useState(false);

  // Deep entry (e.g. a notification tap) can reach here before the gate has loaded the profile.
  useEffect(() => {
    if (!ready || !signedIn || profileLoaded) return;
    // Never block the screen on a slow/hung request: after 1.5 s render anyway (screens show an
    // unknown name neutrally) and let the reload finish, or the reconnect retry, fill it in.
    const giveUp = setTimeout(() => setLoadFailed(true), 1500);
    useSessionStore
      .getState()
      .refreshProfile()
      .catch(() => setLoadFailed(true))
      .finally(() => clearTimeout(giveUp));
    return () => clearTimeout(giveUp);
  }, [ready, signedIn, profileLoaded]);

  if (!ready) return <Screen>{null}</Screen>;
  if (!signedIn) return <Redirect href={href('/welcome')} />;
  if (profileLoaded && !profile) return <Redirect href={href('/welcome')} />;
  if (!profileLoaded && !loadFailed) return <Screen>{null}</Screen>;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {/* The one ride session and its overlays; a sibling so it survives Back to Home. */}
      <RideHost />
    </>
  );
}
