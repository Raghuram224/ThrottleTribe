import { useSyncExternalStore } from 'react';

import { destKey } from '@/lib/nav-arrival';
import { navRideDest, subscribeNavRides } from '@/lib/nav-rides';

/**
 * "This phone navigated this ride to this stop" (22 D6), read from the device marker and kept live: the ride layout
 * (which writes it) and the live screen (which reads it) see every change at once, so they never disagree about
 * whether turn-by-turn is on. `stop` is the ride's current stop; a different stop than the marked one is false.
 */
export function useNavRide(rideId: string | undefined, stop: { lat: number; lng: number } | null): boolean {
  const marked = useSyncExternalStore(
    subscribeNavRides,
    () => navRideDest(rideId),
    () => null,
  );
  const key = destKey(stop);
  return key !== '' && marked === key;
}
