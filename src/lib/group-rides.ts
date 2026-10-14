// Rides this phone created as group rides (22 decision 1): a group ride never starts turn-by-turn, whether one
// rider or ten are present when it starts. Remembered in local storage so it survives an app restart.
//
// Device-local on purpose (a server flag would need a migration): on another device, or after a reinstall, the
// marker is missing and the check fails open, so a leader who is alone in a group ride there could navigate.
// A marker is dropped when its ride ends or I leave it (the ride layout), not by count.
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** Only a runaway list is cut (rides I never saw end); normal use stays far under it. */
const SAFETY_CAP = 100;

export function parseGroupRides(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(-SAFETY_CAP) : [];
  } catch {
    return [];
  }
}

export function markGroupRide(rideId: string): void {
  const ids = parseGroupRides(readItem(STORAGE_KEYS.groupRides));
  if (ids.includes(rideId)) return;
  writeItem(STORAGE_KEYS.groupRides, JSON.stringify([...ids, rideId].slice(-SAFETY_CAP)));
}

/** The ride ended (or I left it): its marker is no longer needed. */
export function unmarkGroupRide(rideId: string): void {
  const ids = parseGroupRides(readItem(STORAGE_KEYS.groupRides));
  if (!ids.includes(rideId)) return;
  const rest = ids.filter((x) => x !== rideId);
  writeItem(STORAGE_KEYS.groupRides, rest.length > 0 ? JSON.stringify(rest) : null);
}

/** Rides I did not see end (the leader ended them while I was elsewhere): Home drops their markers from the ended list. */
export function pruneGroupRides(endedIds: readonly string[]): void {
  const ids = parseGroupRides(readItem(STORAGE_KEYS.groupRides));
  const rest = ids.filter((x) => !endedIds.includes(x));
  if (rest.length === ids.length) return;
  writeItem(STORAGE_KEYS.groupRides, rest.length > 0 ? JSON.stringify(rest) : null);
}

export function isGroupRide(rideId: string | undefined): boolean {
  return !!rideId && parseGroupRides(readItem(STORAGE_KEYS.groupRides)).includes(rideId);
}
