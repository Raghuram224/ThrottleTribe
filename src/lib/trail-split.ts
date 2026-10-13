import { buildTrail, projectOntoTrail, type LatLng, type Trail } from '@/lib/geo';

/** Beyond this distance from the trail my position says nothing about where on it I am. */
export const SPLIT_OFF_TRAIL_M = 150;

export interface TrailSplit {
  /** Already crossed (start .. my projection). */
  behind: LatLng[];
  /** Still to come (my projection .. end). */
  ahead: LatLng[];
}

const xy = (p: LatLng): LatLng => ({ lat: p.lat, lng: p.lng });

/**
 * Splits the leader trail at my projected position so the map can fade what is crossed and
 * highlight what is left. The projected point is in both halves so they join seamlessly.
 * The leader is at the head, so everything is behind; a rider behind the leader has the
 * leader's path beyond them ahead. With no position, or when I am off the trail (> 150 m), I am
 * not on that path and nothing counts as crossed: the whole trail is ahead.
 */
export function splitTrailAt(trail: Trail, me: LatLng | null, iAmLeader = false): TrailSplit {
  const pts = trail.points;
  // The trail IS the leader's own path: all of it is crossed. Projecting would be wrong on an
  // out-and-back ride, where the nearest segment can be an earlier pass over the same road.
  if (iAmLeader) return { behind: pts.map(xy), ahead: [] };
  if (pts.length < 2) return { behind: [], ahead: pts.map(xy) };
  if (!me) return { behind: [], ahead: pts.map(xy) };
  const proj = projectOntoTrail(trail, me);
  if (proj.offTrailM > SPLIT_OFF_TRAIL_M) return { behind: [], ahead: pts.map(xy) };

  const along = proj.alongM;
  if (along <= 0) return { behind: [], ahead: pts.map(xy) };
  if (along >= trail.totalM) return { behind: pts.map(xy), ahead: [] };

  // Segment i holds the split: cumulativeM[i] <= along < cumulativeM[i + 1].
  let i = 0;
  while (i < pts.length - 2 && trail.cumulativeM[i + 1] <= along) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const segLen = trail.cumulativeM[i + 1] - trail.cumulativeM[i];
  const t = segLen > 0 ? (along - trail.cumulativeM[i]) / segLen : 0;
  const split: LatLng = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return {
    behind: [...pts.slice(0, i + 1).map(xy), split],
    ahead: [split, ...pts.slice(i + 1).map(xy)],
  };
}

/**
 * My road route to the stop, cut at my position: the route is fetched only now and then, so the
 * stretch ridden since the last fetch must not stay bright. Unchanged when I am off the route
 * (a re-route is coming) or have no position.
 */
export function trimRouteAt(coords: LatLng[], me: LatLng | null): LatLng[] {
  if (!me || coords.length < 2) return coords;
  const route = buildTrail(coords.map((p) => ({ lat: p.lat, lng: p.lng, t: 0 })), 0);
  if (route.points.length < 2) return coords;
  const { behind, ahead } = splitTrailAt(route, me);
  return behind.length > 0 && ahead.length >= 2 ? ahead : coords;
}
