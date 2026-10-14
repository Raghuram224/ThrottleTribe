// Solo navigation ride (docs/design/21 §2.4): a solo ride whose next stop is the destination. The ride
// row is created only here, at Go; Where to? and the preview never touch Supabase.
import { copy } from '@/lib/copy';
import { hrefAfterEnter } from '@/lib/enter-ride';
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

type NavPlace = Pick<Place, 'name' | 'address' | 'lat' | 'lng' | 'category'>;

export interface NavigationStart {
  rideId: string;
  /** The route to open. */
  href: string;
  /** A ride was already open: it is opened as it is and nothing was created or set. */
  existing: boolean;
}

/**
 * create_ride -> start_ride -> propose_stop (the leader's own stop applies at once), then the route to open
 * (`/ride/<id>/live`, or the permissions explainer first). If any step after create fails the ride is
 * ended (retried once, then remembered and ended later, see stranded-rides), so no half-made ride is left;
 * the original error is the one to show. One start at a time (`RideStartBusy`), and an already open ride is
 * opened instead of creating a second one.
 */
export function startNavigationRide(place: NavPlace, stopThresholdS: number): Promise<NavigationStart> {
  return withStartLock(async () => {
    const open = await getMyOpenRide();
    if (open) return { rideId: open.ride.id, href: await hrefAfterEnter(open.ride), existing: true };
    const ride = await createRide(copy['solo.rideName'], stopThresholdS);
    try {
      const started = await startRide(ride.id);
      await proposeStop(ride.id, {
        name: place.name.slice(0, STOP_NAME_MAX),
        address: place.address.slice(0, STOP_ADDRESS_MAX),
        lat: place.lat,
        lng: place.lng,
        kind: stopKindFor(place.category),
      });
      return { rideId: ride.id, href: await hrefAfterEnter(started), existing: false };
    } catch (e) {
      await rollbackRide(ride.id);
      throw e;
    }
  });
}
