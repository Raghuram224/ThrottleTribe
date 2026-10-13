import { useEffect } from 'react';

import { subscribeToRide } from '@/lib/ride-channel';
import { useRideStore, type ChannelStatus } from '@/store/ride-store';

/** Keeps the ride store live while the calling screen is mounted. Returns the channel status. */
export function useRideChannel(rideId: string | null | undefined): ChannelStatus {
  useEffect(() => {
    if (!rideId) return;
    // Show cached state immediately; the SUBSCRIBED callback refetches again.
    void useRideStore.getState().load(rideId);
    return subscribeToRide(rideId);
  }, [rideId]);

  return useRideStore((s) => s.channelStatus);
}
