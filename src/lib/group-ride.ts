// A group ride (22 §3.6): create_ride, then the destination attached with propose_stop. The leader's own stop
// applies at once and the RPC allows it while the ride is in the lobby, so every joiner's normal load already
// carries it. If the stop fails the ride is undone: nobody has the code yet, so nothing half-made is left.
import { hrefAfterEnter } from '@/lib/enter-ride';
import { leaveIfMember } from '@/lib/leave-ride';
import { markGroupRide, unmarkGroupRide } from '@/lib/group-rides';
import { createRide, getMyOpenRide, proposeStop, type RideRow } from '@/lib/ride-api';
import { withStartLock } from '@/lib/ride-start';
import { STOP_ADDRESS_MAX, STOP_NAME_MAX, stopKindFor, type NavPlace } from '@/lib/solo-nav';
import { rollbackRide } from '@/lib/stranded-rides';

export interface GroupRideInput {
  name: string;
  thresholdS: number;
  /** The destination chosen on the map home, or null for a ride without one. */
  dest: NavPlace | null;
  /** The ride I confirmed leaving (Home's switch sheet): left only now that a new one is really being made. */
  leaveRideId?: string;
}

export type GroupRideStart =
  | { existing: false; ride: RideRow }
  /** A ride was already open: it is opened as it is and nothing was created (as the solo path does). */
  | { existing: true; rideId: string; href: string };

/**
 * One start at a time (`RideStartBusy` otherwise). Throws the original error; a failed stop has rolled the ride
 * back. Never a second open ride: unless I just confirmed leaving one (`leaveRideId`), an already open ride is
 * opened instead, like `startNavigationRide`.
 */
export function createGroupRide(i: GroupRideInput): Promise<GroupRideStart> {
  return withStartLock(async (): Promise<GroupRideStart> => {
    if (i.leaveRideId) {
      await leaveIfMember(i.leaveRideId);
    } else {
      const open = await getMyOpenRide();
      if (open) return { existing: true, rideId: open.ride.id, href: await hrefAfterEnter(open.ride) };
    }
    const ride = await createRide(i.name, i.thresholdS, { withDest: !!i.dest });
    markGroupRide(ride.id);
    if (!i.dest) return { existing: false, ride };
    try {
      await proposeStop(ride.id, {
        name: i.dest.name.slice(0, STOP_NAME_MAX),
        address: i.dest.address.slice(0, STOP_ADDRESS_MAX),
        lat: i.dest.lat,
        lng: i.dest.lng,
        kind: stopKindFor(i.dest.category),
      });
      return { existing: false, ride };
    } catch (e) {
      unmarkGroupRide(ride.id);
      await rollbackRide(ride.id);
      throw e;
    }
  });
}
