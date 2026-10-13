// My distance per ended ride, cached on this phone the first time the summary computes it
// (docs/design/13 §3). Home shows "86 km" only when cached and never computes it itself.
import { parseRideStats } from '@/lib/recent-rides';
import { parseSketches, serializeSketches, type SketchPoint } from '@/lib/route-sketch';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

const KEY = 'rideStats';
const MAX_ENTRIES = 50;

export function readRideStats(): Record<string, number> {
  return parseRideStats(readItem(KEY));
}

export function cacheRideDistance(rideId: string, meters: number): void {
  if (!Number.isFinite(meters) || meters < 0) return;
  const stats = readRideStats();
  stats[rideId] = Math.round(meters);
  // Oldest entries fall off first (object keys keep insertion order).
  const keys = Object.keys(stats);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete stats[k];
  writeItem(KEY, JSON.stringify(stats));
}

/** Route sketches (16 §3): normalised polylines of my samples, written next to the distance. */
export function readRideSketches(): Record<string, SketchPoint[]> {
  return parseSketches(readItem(STORAGE_KEYS.rideSketches));
}

export function cacheRideSketch(rideId: string, points: readonly SketchPoint[]): void {
  if (points.length < 2) return;
  const all: Record<string, readonly SketchPoint[]> = readRideSketches();
  all[rideId] = points;
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[k];
  writeItem(STORAGE_KEYS.rideSketches, serializeSketches(all));
}
