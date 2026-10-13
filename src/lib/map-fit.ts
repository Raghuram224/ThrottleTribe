// Pure camera maths for the live map (docs/design/06 §3).
import type { LatLng } from '@/lib/geo';

export type Bounds = [west: number, south: number, east: number, north: number];

/**
 * Minimum fitted span. 06 asks for "min span 300 m" and "max zoom 16" together; on a ~360 dp wide
 * map zoom 16 shows about 860 m, so a 900 m span is what actually keeps fits at or below zoom 16.
 */
export const MIN_FIT_SPAN_M = 900;
const M_PER_DEG_LAT = 111_320;

/** Bounds around every point, grown to at least MIN_FIT_SPAN_M in both directions. Null for no points. */
export function fitBoundsFor(points: LatLng[], minSpanM = MIN_FIT_SPAN_M): Bounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const midLat = (south + north) / 2;
  const minLat = minSpanM / M_PER_DEG_LAT;
  const minLng = minSpanM / (M_PER_DEG_LAT * Math.max(0.05, Math.cos((midLat * Math.PI) / 180)));
  if (north - south < minLat) {
    const pad = (minLat - (north - south)) / 2;
    south -= pad;
    north += pad;
  }
  if (east - west < minLng) {
    const pad = (minLng - (east - west)) / 2;
    west -= pad;
    east += pad;
  }
  return [west, south, east, north];
}

/** True when any point lies outside the viewport bounds. */
export function anyOutside(points: LatLng[], view: Bounds): boolean {
  const [w, s, e, n] = view;
  return points.some((p) => p.lng < w || p.lng > e || p.lat < s || p.lat > n);
}
