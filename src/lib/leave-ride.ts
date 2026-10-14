// Leaving the ride I have open before I start another (Home's switch sheet confirmed it): the server first
// ("not a member" means it is already gone), then my own tracking.
import { stopRideTracking } from '@/lib/location/tracking';
import { leaveRide, toRideError } from '@/lib/ride-api';

export async function leaveIfMember(rideId: string): Promise<void> {
  try {
    await leaveRide(rideId);
  } catch (e) {
    if (toRideError(e).code !== 'not_a_member') throw e;
  }
  await stopRideTracking();
}
