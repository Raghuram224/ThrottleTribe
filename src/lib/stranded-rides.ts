// A ride made for navigation whose set-up failed is ended again at once (solo-nav). If that end call
// fails too (offline), the ride would sit open for ever, so it is retried once, then remembered on this phone
// and ended on the next app start / reconnect (the session store's refresh run calls `endStrandedRides`).
import { endRide, toRideError } from '@/lib/ride-api';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** Wait before the one retry of a failed rollback. */
export const ROLLBACK_RETRY_MS = 1500;

export function readStranded(): string[] {
  try {
    const v: unknown = JSON.parse(readItem(STORAGE_KEYS.strandedRides) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  } catch {
    return [];
  }
}

function writeStranded(ids: string[]): void {
  writeItem(STORAGE_KEYS.strandedRides, ids.length ? JSON.stringify(ids) : null);
}

/** Ends the half-made ride: now, once more shortly after, then it is left for `endStrandedRides`. Never throws. */
export async function rollbackRide(rideId: string, retryMs = ROLLBACK_RETRY_MS): Promise<void> {
  try {
    await endRide(rideId);
    return;
  } catch {
    // Retry below.
  }
  await new Promise<void>((resolve) => setTimeout(resolve, retryMs));
  try {
    await endRide(rideId);
  } catch {
    const ids = readStranded();
    if (!ids.includes(rideId)) writeStranded([...ids, rideId]);
  }
}

/**
 * Ends every remembered ride. An id leaves the list once the server answered (ended, or an error that
 * retrying cannot fix, such as "already ended"); only a network failure keeps it for the next time. Never throws.
 */
export async function endStrandedRides(): Promise<void> {
  const ids = readStranded();
  if (ids.length === 0) return;
  const keep: string[] = [];
  for (const id of ids) {
    try {
      await endRide(id);
    } catch (e) {
      if (toRideError(e).code === 'network') keep.push(id);
    }
  }
  // Re-read: a rollback may have added ids while this ran.
  const added = readStranded().filter((id) => !ids.includes(id));
  writeStranded([...keep, ...added]);
}
