// Last-known profile and open ride, kept in local storage so a cold start without signal still
// lands the rider in their ride (or home) instead of onboarding. Written whenever the server
// answers; read only when the network cannot.
import type { RecentRide } from '@/lib/recent-rides';
import type { RideStatusName } from '@/lib/routing';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

export interface CachedRide {
  id: string;
  status: RideStatusName;
}

function readJson<T>(key: string): T | null {
  const raw = readItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function cacheProfile(profile: object | null): void {
  writeItem(STORAGE_KEYS.cachedProfile, profile ? JSON.stringify(profile) : null);
}

export function readCachedProfile<T extends object>(): T | null {
  return readJson<T>(STORAGE_KEYS.cachedProfile);
}

/** `null` = I have no open ride (clears the cache). */
export function cacheOpenRide(ride: CachedRide | null): void {
  writeItem(STORAGE_KEYS.cachedOpenRide, ride ? JSON.stringify({ id: ride.id, status: ride.status }) : null);
}

export function readCachedOpenRide(): CachedRide | null {
  const r = readJson<CachedRide>(STORAGE_KEYS.cachedOpenRide);
  if (!r || typeof r.id !== 'string') return null;
  return r.status === 'lobby' || r.status === 'active' ? r : null;
}

/** Called when a ride changes status or I leave it: keeps the cache in step with what I just saw. */
export function syncCachedRide(rideId: string, status: RideStatusName, left: boolean): void {
  if (left || status === 'ended') {
    if (readCachedOpenRide()?.id === rideId) cacheOpenRide(null);
  } else {
    cacheOpenRide({ id: rideId, status });
  }
}

/** Last successful "recent rides" list, shown while offline instead of hiding the section. */
export function cacheRecentRides(rides: RecentRide[]): void {
  writeItem(STORAGE_KEYS.cachedRecentRides, JSON.stringify(rides));
}

export function readCachedRecentRides(): RecentRide[] | null {
  const list = readJson<unknown>(STORAGE_KEYS.cachedRecentRides);
  if (!Array.isArray(list)) return null;
  const ok = list.every(
    (r) => !!r && typeof r === 'object' && typeof (r as RecentRide).id === 'string' && typeof (r as RecentRide).endedAt === 'string',
  );
  return ok ? (list as RecentRide[]) : null;
}

export function clearOfflineCache(): void {
  cacheProfile(null);
  cacheOpenRide(null);
  writeItem(STORAGE_KEYS.cachedRecentRides, null);
}
