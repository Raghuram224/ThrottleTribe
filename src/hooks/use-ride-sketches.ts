import { useEffect, useState } from 'react';

import type { RecentRide } from '@/lib/recent-rides';
import { fetchMySamples } from '@/lib/ride-api';
import { buildSketch, type SketchPoint } from '@/lib/route-sketch';
import { cacheRideDistance, cacheRideSketch, readRideSketches, readRideStats } from '@/lib/ride-stats';
import { filterSamples, sumDistanceM } from '@/lib/summary';

/** At most this many missing rides are backfilled per list, newest first. */
const BACKFILL_MAX = 3;
/** Rides already tried this session (success or failure): no retry loop while the list re-renders. */
const attempted = new Set<string>();

/**
 * My cached distance and route sketch per recent ride (16 §3). Rides never opened on this phone have
 * neither, so the newest few are backfilled one at a time in the background from my own samples (the
 * same query the summary uses) and cached with their distance. Failures are silent: the tile shows
 * the flag glyph until the summary is opened.
 */
export function useRideSketches(rides: RecentRide[] | null): {
  sketches: Record<string, SketchPoint[]>;
  stats: Record<string, number>;
} {
  const [sketches, setSketches] = useState(readRideSketches);
  const [stats, setStats] = useState(readRideStats);
  const ids = rides ? rides.map((r) => r.id).join(',') : '';

  useEffect(() => {
    if (!ids) return;
    const have = readRideSketches();
    const todo = ids
      .split(',')
      .filter((id) => !have[id] && !attempted.has(id))
      .slice(0, BACKFILL_MAX);
    if (todo.length === 0) return;
    let alive = true;
    (async () => {
      for (const id of todo) {
        attempted.add(id);
        try {
          const clean = filterSamples(await fetchMySamples(id));
          if (!alive) return;
          if (clean.length < 2) continue;
          cacheRideDistance(id, sumDistanceM(clean));
          const sketch = buildSketch(clean);
          if (sketch) cacheRideSketch(id, sketch);
          setSketches(readRideSketches());
          setStats(readRideStats());
        } catch {
          // Offline or RLS: leave the flag tile.
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [ids]);

  return { sketches, stats };
}
