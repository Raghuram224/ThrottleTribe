// Recent places for "Where to?" (docs/design/21 §2.2). Pure list logic, no storage and no React.
// The list lives on this device only (see store/recents-store.ts).
import { haversineM } from '@/lib/geo';
import type { PlaceCategory, PlaceSource } from '@/lib/place-search';

export interface RecentPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  /** Who found it (the credit line, 24 §2.4); entries saved before Geoapify have none and read as Photon. */
  source: PlaceSource;
  /** ms since epoch of the last time navigation started to this place. */
  usedAt: number;
}

/** Stored cap and the number shown on Where to?. */
export const MAX_RECENTS = 8;
export const SHOWN_RECENTS = 5;
/** A place this close to an existing entry is the same place (a different Photon id for the same door). */
export const SAME_PLACE_M = 50;

const CATEGORIES: readonly PlaceCategory[] = ['cafe', 'fuel', 'restaurant', 'parking', 'toilets', 'other'];

/**
 * Puts `place` first. Drops any entry with the same id or within 50 m of it, and keeps at most 8
 * (the oldest fall off). Never mutates `list`.
 */
export function addRecent(
  list: readonly RecentPlace[],
  place: Omit<RecentPlace, 'usedAt'>,
  now: number,
): RecentPlace[] {
  const kept = list.filter((r) => r.id !== place.id && haversineM(r, place) > SAME_PLACE_M);
  const entry: RecentPlace = {
    id: place.id,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    source: place.source,
    usedAt: now,
  };
  return [entry, ...kept].slice(0, MAX_RECENTS);
}

const SOURCES: readonly PlaceSource[] = ['geoapify', 'photon'];

/** An entry as stored: `source` may be missing (written before spec 24). */
type StoredRecent = Omit<RecentPlace, 'source'> & { source?: unknown };

function isRecent(v: unknown): v is StoredRecent {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.name === 'string' &&
    r.name.length > 0 &&
    typeof r.address === 'string' &&
    typeof r.lat === 'number' &&
    typeof r.lng === 'number' &&
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    Math.abs(r.lat) <= 90 &&
    Math.abs(r.lng) <= 180 &&
    CATEGORIES.includes(r.category as PlaceCategory) &&
    typeof r.usedAt === 'number' &&
    (r.source === undefined || SOURCES.includes(r.source as PlaceSource))
  );
}

/** Reads the stored JSON; anything invalid gives `[]`, and single bad entries are skipped. Newest first, capped. */
export function parseRecents(raw: string | null | undefined): RecentPlace[] {
  if (!raw) return [];
  try {
    const json: unknown = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    return json
      .filter(isRecent)
      .map((r): RecentPlace => ({ ...r, source: r.source === 'geoapify' ? 'geoapify' : 'photon' }))
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

/** The rows Where to? shows. */
export function shownRecents(list: readonly RecentPlace[]): RecentPlace[] {
  return list.slice(0, SHOWN_RECENTS);
}
