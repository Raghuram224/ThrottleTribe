// Rides this phone navigates as the leader, and to which destination (22 D5, D6). A ride is started with one kind of
// Start; riders join it later, and the leader keeps turn-by-turn after they do (21 §10). The running session proves
// that only while the ride screens are mounted and the process lives: after Back to Home, or a restart, the ride has
// several riders and the engine is gone. This marker is what lets the leader's navigation resume then (isNavActive
// `navRide`).
//
// The marker holds the destination (rideId -> destKey), not just the ride: it says "I navigate THIS stop". A stop
// that was set later with riders present (an accepted proposal, a stop the leader added to a group) is not the one
// this phone navigated, so it is never navigated, whether or not the ride screen remounted (D6, review H1).
//
// Device-local on purpose (a server flag would need a migration). A phone with no marker (another device, a
// reinstall) just does not resume turn-by-turn in a ride that already has riders: it fails closed, the group
// still has the route line and the stop card. A marker is dropped when its ride ends, I leave it, or I sign out.
import { clearGroupFormed, forgetGroupFormed, forgetGroupFormedFor } from '@/lib/group-formed';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** Only a runaway list is cut (rides I never saw end); normal use stays far under it. */
const SAFETY_CAP = 100;

/**
 * rideId -> destKey. The first version of the marker was a list of ride ids with no destination: it cannot say
 * which stop was navigated, so it is read as empty (it never shipped; a ride loses nothing it had).
 */
export function parseNavRides(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    const entries = Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0);
    return Object.fromEntries(entries.slice(-SAFETY_CAP));
  } catch {
    return {};
  }
}

const read = () => parseNavRides(readItem(STORAGE_KEYS.navRides));

const listeners = new Set<() => void>();

/** Bumps on every new marker: an open-ride read that began before it cannot say whether the new ride is open. */
let markEpoch = 0;
export const navRideEpoch = () => markEpoch;

function write(map: Record<string, string>): void {
  writeItem(STORAGE_KEYS.navRides, Object.keys(map).length > 0 ? JSON.stringify(map) : null);
  for (const l of [...listeners]) l();
}

/** Called after every change to the marker (for `useSyncExternalStore`): the layout and the live screen agree. */
export function subscribeNavRides(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** This phone is navigating this ride to this destination as its leader: remember it across a remount or a restart. */
export function markNavRide(rideId: string, destKey: string): void {
  if (!rideId || !destKey) return;
  const map = read();
  if (map[rideId] === destKey) return;
  markEpoch += 1;
  // Re-marking moves the ride to the end, so the safety cap drops the oldest first.
  delete map[rideId];
  write(Object.fromEntries(Object.entries({ ...map, [rideId]: destKey }).slice(-SAFETY_CAP)));
}

/** The ride ended (or I left it): its marker is no longer needed. */
export function unmarkNavRide(rideId: string): void {
  forgetGroupFormed(rideId);
  const map = read();
  if (!(rideId in map)) return;
  delete map[rideId];
  write(map);
}

/** Keys of features that no longer exist: removed once, wherever Home prunes. */
function dropLegacyKeys(): void {
  // The marker of the old "group ride" rule (22 decision 1, withdrawn by D5) has no job any more, nor has the solo
  // full-map "seen" marker (the full-map default was removed).
  for (const key of [STORAGE_KEYS.legacyGroupRides, STORAGE_KEYS.legacySoloFullMapSeen]) {
    if (readItem(key) !== null) writeItem(key, null);
  }
}

/**
 * Markers of rides that are not my open ride (22 L7): a ride cancelled or ended from the lobby never appears in the
 * recent-rides list, so `pruneNavRides` cannot see it. Call with the result of a SUCCESSFUL open-ride read only
 * (an offline cache could name a ride that has ended). Pure: the ids to drop.
 */
export function staleNavRideIds(markedIds: readonly string[], open: { id: string } | null): string[] {
  return markedIds.filter((id) => id !== open?.id);
}

/** Drops the markers of every ride that is not `open` (see `staleNavRideIds`). `readAtEpoch` is `navRideEpoch()` from before the read. */
export function pruneNavRidesExcept(open: { id: string } | null, readAtEpoch?: number): void {
  if (readAtEpoch !== undefined && readAtEpoch !== markEpoch) return;
  const map = read();
  const stale = staleNavRideIds(Object.keys(map), open);
  if (stale.length === 0) return;
  forgetGroupFormedFor(stale);
  write(Object.fromEntries(Object.entries(map).filter(([id]) => !stale.includes(id))));
}

/** Rides I did not see end (the leader ended them while I was elsewhere): Home drops their markers from the ended list. */
export function pruneNavRides(endedIds: readonly string[]): void {
  dropLegacyKeys();
  forgetGroupFormedFor(endedIds);
  const map = read();
  const rest = Object.fromEntries(Object.entries(map).filter(([id]) => !endedIds.includes(id)));
  if (Object.keys(rest).length !== Object.keys(map).length) write(rest);
}

/** Sign-out: the markers belong to the account's rides on this phone. */
export function clearNavRides(): void {
  const had = readItem(STORAGE_KEYS.navRides) !== null;
  dropLegacyKeys();
  clearGroupFormed();
  if (had) write({});
}

/** The destination this phone navigates the ride to, or null. */
export function navRideDest(rideId: string | undefined): string | null {
  return rideId ? (read()[rideId] ?? null) : null;
}

/** True when `destKey` (the ride's current stop) is the one this phone navigated; no stop ('') never is. */
export function isNavRideFor(rideId: string | undefined, destKey: string): boolean {
  return destKey !== '' && navRideDest(rideId) === destKey;
}
