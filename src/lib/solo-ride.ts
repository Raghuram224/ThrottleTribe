// Solo ride (19 §C): create and start a one-rider ride, then route like any ride start (the same
// permission check, straight to live: no invite, no lobby).
import { copy } from '@/lib/copy';
import { hrefAfterEnter } from '@/lib/enter-ride';
import { createRide, startRide } from '@/lib/ride-api';
import { openRideHref, withStartLock } from '@/lib/ride-start';
import { rollbackRide } from '@/lib/stranded-rides';

/**
 * Returns the route to open (`/ride/<id>/live`, or the permissions explainer first). When a ride is already
 * open that ride is the answer: a second one is never created. Throws `RideStartBusy` while another start runs.
 */
export function startSoloRide(stopThresholdS: number): Promise<string> {
  return withStartLock(async () => {
    const existing = await openRideHref();
    if (existing) return existing;
    const ride = await createRide(copy['solo.rideName'], stopThresholdS);
    try {
      return await hrefAfterEnter(await startRide(ride.id));
    } catch (e) {
      // Do not strand a half-made ride in the lobby; the original error is the one to show.
      await rollbackRide(ride.id);
      throw e;
    }
  });
}
