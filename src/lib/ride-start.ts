// Shared by every way of starting a ride from the pre-ride screens (Go on the preview, "Just ride"): one at a
// time, and never a second ride while one is open. Without this, Android back during Go followed by "Just
// ride" (or a stale Home that does not know about the open ride) could create two rides.
import { hrefAfterEnter } from '@/lib/enter-ride';
import { getMyOpenRide } from '@/lib/ride-api';

let starting = false;

/** Another start is in flight. Screens ignore this error (the first start is still running). */
export class RideStartBusy extends Error {
  constructor() {
    super('ride_start_busy');
    this.name = 'RideStartBusy';
  }
}

export function isRideStartBusy(e: unknown): e is RideStartBusy {
  return e instanceof RideStartBusy;
}

/** True while a start runs (the preview blocks Back meanwhile). */
export function isStartingRide(): boolean {
  return starting;
}

/** Runs `fn` as the one ride start in flight; throws `RideStartBusy` when another is. Released on any outcome. */
export async function withStartLock<T>(fn: () => Promise<T>): Promise<T> {
  if (starting) throw new RideStartBusy();
  starting = true;
  try {
    return await fn();
  } finally {
    starting = false;
  }
}

/** Route to the ride I already have open, or null when there is none (asks the server; throws when it cannot). */
export async function openRideHref(): Promise<string | null> {
  const open = await getMyOpenRide();
  return open ? await hrefAfterEnter(open.ride) : null;
}
