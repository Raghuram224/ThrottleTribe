import { readPermissions } from '@/lib/permissions';
import type { RideRow } from '@/lib/ride-api';
import { permissionSteps, rideHref } from '@/lib/routing';

/**
 * Where to go after creating or joining a ride (04): the permissions explainer when something is
 * still undetermined, otherwise straight into the ride. The ride layout starts tracking itself.
 */
export async function hrefAfterEnter(ride: Pick<RideRow, 'id' | 'status'>): Promise<string> {
  const target = rideHref(ride.id, ride.status);
  try {
    const { snapshot } = await readPermissions();
    if (permissionSteps(snapshot).length === 0) return target;
  } catch {
    return target;
  }
  const next = ride.status === 'lobby' ? 'lobby' : 'live';
  return `/permissions?rideId=${ride.id}&next=${next}`;
}
