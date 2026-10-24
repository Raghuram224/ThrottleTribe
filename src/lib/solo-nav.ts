// Solo navigation ride (docs/design/21 §2.4): a solo ride whose next stop is the destination. The ride
// row is created only here, at Go; Where to? and the preview never touch Supabase.
import { hrefAfterEnter } from '@/lib/enter-ride';
import { leaveIfMember } from '@/lib/leave-ride';
import { destKey } from '@/lib/nav-arrival';
import { markNavRide, unmarkNavRide } from '@/lib/nav-rides';
import type { Place, PlaceCategory } from '@/lib/place-search';
import { createRide, getMyOpenRide, proposeStop, startRide, type StopKind } from '@/lib/ride-api';
import { withStartLock } from '@/lib/ride-start';
import { rollbackRide } from '@/lib/stranded-rides';

/** The RPC limits (19 A): name 1-80 characters, address up to 160. */
export const STOP_NAME_MAX = 80;
export const STOP_ADDRESS_MAX = 160;

/** Cafe, fuel, restaurant, toilets and parking are stops on the way ('break'); anything else is a destination. */
export function stopKindFor(category: PlaceCategory): StopKind {
  return category === 'other' ? 'destination' : 'break';
}

export type NavPlace = Pick<Place, 'name' | 'address' | 'lat' | 'lng' | 'category'>;

export interface NavigationStart {
  rideId: string;
  /** The route to open. */
  href: string;
  /** A ride was already open: it is opened as it is and nothing was created or set. */
  existing: boolean;
}

function stopInput(place: NavPlace) {
  return {
    name: place.name.slice(0, STOP_NAME_MAX),
    address: place.address.slice(0, STOP_ADDRESS_MAX),
    lat: place.lat,
    lng: place.lng,
    kind: stopKindFor(place.category),
    category: place.category,
  };
}

interface StartOpts {
  leaveRideId?: string;
  /** The ride's name (`defaultRideName(first)`): one kind of ride, it may be shared. Never the destination. */
  rideName: string;
}

/**
 * create_ride -> start_ride -> propose_stop (the leader's own stop applies at once), then the route to open
 * (`/ride/<id>/live`, or the permissions explainer first). If any step after create fails the ride is
 * ended (retried once, then remembered and ended later, see stranded-rides), so no half-made ride is left;
 * the original error is the one to show. One start at a time (`RideStartBusy`), and an already open ride is
 * opened instead of creating a second one (unless `leaveRideId` says I just left it). The ride is marked as
 * navigated to this stop (22 D6), so its leader keeps turn-by-turn once riders join.
 */
export function startNavigationRide(place: NavPlace, stopThresholdS: number, opts: StartOpts): Promise<NavigationStart> {
  return withStartLock(async () => {
    const open = await openRideFirst(opts.leaveRideId);
    if (open) return open;
    // The normal default name, not "Solo ride": any ride can become a group, and the name goes in the invite text.
    const ride = await createRide(opts.rideName, stopThresholdS, { startKind: 'start' });
    try {
      const started = await startRide(ride.id);
      await proposeStop(ride.id, stopInput(place));
      markNavRide(ride.id, destKey(place));
      return { rideId: ride.id, href: await hrefAfterEnter(started), existing: false };
    } catch (e) {
      unmarkNavRide(ride.id);
      await rollbackRide(ride.id);
      throw e;
    }
  });
}

/**
 * Invite riders from the route preview (22 D6): create_ride -> propose_stop, and the ride stays in the lobby. The
 * route to open is the invite screen (code + WhatsApp) in "first" mode, which continues to the lobby; the leader
 * taps Start there when the riders are in. Same start lock, same open-ride check, and the same rollback as Start:
 * if the stop cannot be set the ride is ended again. The ride is marked as navigated to this stop at creation, so
 * the leader navigates after starting a lobby ride that already has riders.
 */
export function startInviteRide(place: NavPlace, stopThresholdS: number, opts: StartOpts): Promise<NavigationStart> {
  return withStartLock(async () => {
    const open = await openRideFirst(opts.leaveRideId);
    if (open) return open;
    const ride = await createRide(opts.rideName, stopThresholdS, { startKind: 'invite' });
    try {
      await proposeStop(ride.id, stopInput(place));
    } catch (e) {
      await rollbackRide(ride.id);
      throw e;
    }
    markNavRide(ride.id, destKey(place));
    return { rideId: ride.id, href: `/ride/${ride.id}/invite?first=1`, existing: false };
  });
}

/** Home's switch sheet confirmed leaving the open ride (22 §3.5): leave it. Then, a ride still open is opened as it is. */
async function openRideFirst(leaveRideId: string | undefined): Promise<NavigationStart | null> {
  if (leaveRideId) await leaveIfMember(leaveRideId);
  const open = await getMyOpenRide();
  return open ? { rideId: open.ride.id, href: await hrefAfterEnter(open.ride), existing: true } : null;
}
