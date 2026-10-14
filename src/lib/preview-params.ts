// Route params of the route preview (21 §2.2): the picked place travels as plain strings. Pure.
import type { Place, PlaceCategory } from '@/lib/place-search';

type PreviewPlace = Pick<Place, 'id' | 'name' | 'address' | 'lat' | 'lng' | 'category'>;

const CATEGORIES: readonly PlaceCategory[] = ['cafe', 'fuel', 'restaurant', 'parking', 'toilets', 'other'];

/** `/route-preview?id=...&name=...&address=...&lat=...&lng=...&category=...` */
export function previewHref(p: PreviewPlace): string {
  const q = new URLSearchParams({
    id: p.id,
    name: p.name,
    address: p.address,
    lat: String(p.lat),
    lng: String(p.lng),
    category: p.category,
  });
  return `/route-preview?${q.toString()}`;
}

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** The place from the route params; null when the name or the coordinates are missing or out of range. */
export function parsePreviewParams(params: Record<string, string | string[] | undefined>): PreviewPlace | null {
  const name = one(params.name).trim();
  const lat = Number(one(params.lat));
  const lng = Number(one(params.lng));
  if (!name || one(params.lat) === '' || one(params.lng) === '') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const category = one(params.category) as PlaceCategory;
  return {
    id: one(params.id) || `${lat.toFixed(6)},${lng.toFixed(6)}`,
    name,
    address: one(params.address),
    lat,
    lng,
    category: CATEGORIES.includes(category) ? category : 'other',
  };
}
