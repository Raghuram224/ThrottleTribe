// "A ride becomes a group when its code is shared" (22 D5): the moment the first other rider joins a ride of one is
// worth one analytics event (`ride.group_formed`). React-free so the rule is tested. The riders' count is per app run
// (a remount sees the count it already has and fires nothing); that the event was SENT is persisted per ride, so a
// restart in between (1 rider -> restart -> 2) cannot fire it a second time. The flag goes with the ride's markers.
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

const SAFETY_CAP = 100;
const last = new Map<string, number>();

function readSent(): string[] {
  try {
    const v: unknown = JSON.parse(readItem(STORAGE_KEYS.groupFormedSent) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSent(ids: string[]): void {
  writeItem(STORAGE_KEYS.groupFormedSent, ids.length > 0 ? JSON.stringify(ids.slice(-SAFETY_CAP)) : null);
}

/** True once per ride (across restarts), when the count goes from exactly one to more (never for a ride first seen with riders). */
export function noteRiderCount(rideId: string, count: number): boolean {
  const prev = last.get(rideId);
  last.set(rideId, count);
  if (prev !== 1 || count < 2) return false;
  const sent = readSent();
  if (sent.includes(rideId)) return false;
  writeSent([...sent, rideId]);
  return true;
}

/** The ride ended (or I left it): its flag is no longer needed. */
export function forgetGroupFormed(rideId: string): void {
  last.delete(rideId);
  const sent = readSent();
  if (sent.includes(rideId)) writeSent(sent.filter((id) => id !== rideId));
}

/** Rides that are gone: drop their flags in one write. */
export function forgetGroupFormedFor(rideIds: readonly string[]): void {
  const sent = readSent();
  const rest = sent.filter((id) => !rideIds.includes(id));
  if (rest.length !== sent.length) writeSent(rest);
}

export function resetGroupTracker(): void {
  last.clear();
}

/** Sign-out. */
export function clearGroupFormed(): void {
  last.clear();
  writeItem(STORAGE_KEYS.groupFormedSent, null);
}
