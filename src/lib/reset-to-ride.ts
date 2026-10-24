import { router } from 'expo-router';

import { href } from '@/lib/nav';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { liveRideId } from '@/lib/routing';
import { useLiveUiStore } from '@/store/live-ui-store';
import { usePlanStore } from '@/store/plan-store';

/**
 * Opens a ride's live view ON Home's map (28 §8): no screen slides in and the map does not reload; the ride's layers and
 * navigation camera take the one map over. `dismissTo` goes back to the Home already under the current screen (a lobby, a
 * hand-off route, ...) or pushes it when there is none (a cold start straight into the ride), and is a no-op on Home itself.
 */
export function openLiveRide(rideId: string): void {
  // The ride view first, so Home's browse camera is already out of the way when the plan resets (its restore must not run).
  useLiveUiStore.getState().setViewRideId(rideId);
  // Never a stale place or route under the ride (22 §5.3).
  usePlanStore.getState().reset();
  router.dismissTo(href('/home'));
}

/**
 * Opens a ride from the pre-ride screens. A live ride opens on Home's map (`openLiveRide`); anything else (the lobby, the
 * invite screen, the permissions explainer) resets the stack to [home, target] (21 §2.4): Back from it lands on Home, not on
 * a stale Where to? / preview. `dismissTo` pops back to Home (SDK 57: "Dismisses screens until the provided href is
 * reached"), then the target is pushed on top.
 */
export function resetToRide(target: string): void {
  const live = liveRideId(target);
  if (RIDE_ON_HOME && live) {
    openLiveRide(live);
    return;
  }
  // Never a stale place or route under the ride (22 §5.3).
  usePlanStore.getState().reset();
  router.dismissTo(href('/home'));
  router.push(href(target));
}
