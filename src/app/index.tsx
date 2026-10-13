import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { Screen } from '@/components/screen';
import { readCachedOpenRide, readCachedProfile } from '@/lib/offline-cache';
import { withTimeout } from '@/lib/refresh-retrier';
import { getMyOpenRide } from '@/lib/ride-api';
import { decideGate, decideGateLocal } from '@/lib/routing';
import { href } from '@/lib/nav';
import { useSessionStore } from '@/store/session-store';
import { palette } from '@/theme/tokens';

/** How long the splash waits for fresh server data before trusting what is stored on the device. */
const FRESH_DATA_MS = 1500;

/**
 * Gate (00 §1): renders only the splash colour until it knows where to go, so the wrong screen
 * never flashes. The decision comes from LOCAL state (stored session, cached profile/open ride);
 * fresh server answers only replace it when they arrive within FRESH_DATA_MS, so a missing network
 * never holds the splash (supabase-js would otherwise retry a refresh for ~25 s).
 */
export default function Gate() {
  const router = useRouter();
  const ready = useSessionStore((s) => s.ready);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const go = (to: string) => {
      if (!cancelled) router.replace(href(to));
    };

    // "Signed in" = a STORED session; a failed refresh (no signal) must not look like signed out.
    const { signedIn, authRejected, refreshProfile } = useSessionStore.getState();
    const local = decideGateLocal({
      hasSession: signedIn,
      authRejected,
      cachedProfile: readCachedProfile() !== null,
      cachedOpenRide: readCachedOpenRide(),
    });
    if (!signedIn || authRejected) {
      go(local);
    } else {
      void (async () => {
        const fresh = await withTimeout(
          (async () => {
            const profile = await refreshProfile();
            if (!profile) return decideGate({ hasSession: true, profile: 'no', openRide: null });
            const open = await getMyOpenRide();
            return decideGate({
              hasSession: true,
              profile: 'yes',
              openRide: open ? { id: open.ride.id, status: open.ride.status } : null,
            });
          })(),
          FRESH_DATA_MS,
          null,
        );
        // A rejection that arrived meanwhile (token revoked) beats everything.
        const now = useSessionStore.getState();
        go(now.authRejected || !now.signedIn ? '/welcome' : (fresh ?? local));
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [ready, router]);

  return <Screen backgroundColor={palette.brand.primary}>{null}</Screen>;
}
