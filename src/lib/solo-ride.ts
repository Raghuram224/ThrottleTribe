// Solo ride (19 §C): create and start a one-rider ride, then route like any ride start (the same
// permission check, straight to live: no invite, no lobby).
import { copy } from '@/lib/copy';
import { hrefAfterEnter } from '@/lib/enter-ride';
import { createRide, endRide, startRide } from '@/lib/ride-api';

/** Returns the route to open (`/ride/<id>/live`, or the permissions explainer first). */
export async function startSoloRide(stopThresholdS: number): Promise<string> {
  const ride = await createRide(copy['solo.rideName'], stopThresholdS);
  try {
    return await hrefAfterEnter(await startRide(ride.id));
  } catch (e) {
    // Do not strand a half-made ride in the lobby; the original error is the one to show.
    await endRide(ride.id).catch(() => {});
    throw e;
  }
}
