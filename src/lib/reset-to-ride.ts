import { router } from 'expo-router';

import { href } from '@/lib/nav';

/**
 * Opens a ride from the pre-ride screens with the stack reset to [home, ride] (21 §2.4): Back from the ride
 * lands on Home, not on a stale Where to? / preview. `dismissTo` pops back to Home (SDK 57: "Dismisses
 * screens until the provided href is reached"), then the ride is pushed on top.
 */
export function resetToRide(target: string): void {
  router.dismissTo(href('/home'));
  router.push(href(target));
}
