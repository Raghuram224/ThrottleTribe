// Pure screen-space marker clustering for the live map (docs/design/review-round1.md P0-1).
import type { RiderStatus } from '@/lib/rider-status';

/** Rider markers whose centres are closer than this many dp merge into one cluster. */
export const CLUSTER_DP = 44;
/** MapLibre world size at zoom 0, in dp. */
const WORLD_DP_AT_ZOOM_0 = 512;
const MAX_LAT = 85.0511;

export interface ClusterRider {
  userId: string;
  lat: number;
  lng: number;
  status: RiderStatus;
  isMe: boolean;
}

export type MapItem<T extends ClusterRider> =
  | { kind: 'single'; rider: T }
  | { kind: 'cluster'; id: string; members: T[]; lat: number; lng: number; worst: RiderStatus };

const SEVERITY: Record<RiderStatus, number> = { moving: 0, stopped: 1, offline: 2, sos: 3 };

/** The most urgent status of a group: sos > offline > stopped > moving. */
export function worstStatus(statuses: RiderStatus[]): RiderStatus {
  let worst: RiderStatus = 'moving';
  for (const s of statuses) if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  return worst;
}

/** Web-mercator position in dp at `zoom` (an approximation of what the map draws). */
export function projectDp(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const world = WORLD_DP_AT_ZOOM_0 * 2 ** zoom;
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * world,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
  };
}

/** Largest pairwise distance in dp between the members at `zoom`. */
export function spreadDp(members: ClusterRider[], zoom: number): number {
  const pts = members.map((m) => projectDp(m.lat, m.lng, zoom));
  let max = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      max = Math.max(max, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    }
  }
  return max;
}

/**
 * Groups riders closer than `thresholdDp` at `zoom`. SOS riders and my own dot are never clustered:
 * they come back as singles. A group of one is a single. Output order: clusters and singles in input
 * order of their first member, so keys and draw order stay stable between calls.
 */
export function clusterRiders<T extends ClusterRider>(
  riders: T[],
  zoom: number,
  thresholdDp = CLUSTER_DP,
): MapItem<T>[] {
  type Group = { members: T[]; x: number; y: number };
  const groups: (Group | { solo: T })[] = [];
  const open: Group[] = [];

  for (const r of riders) {
    if (r.isMe || r.status === 'sos') {
      groups.push({ solo: r });
      continue;
    }
    const p = projectDp(r.lat, r.lng, zoom);
    const home = open.find((g) => Math.hypot(g.x - p.x, g.y - p.y) < thresholdDp);
    if (home) {
      const n = home.members.length;
      home.members.push(r);
      // Running centroid keeps a chain of riders from drifting the group away from its members.
      home.x = (home.x * n + p.x) / (n + 1);
      home.y = (home.y * n + p.y) / (n + 1);
    } else {
      const g: Group = { members: [r], x: p.x, y: p.y };
      open.push(g);
      groups.push(g);
    }
  }

  return groups.map((g): MapItem<T> => {
    if ('solo' in g) return { kind: 'single', rider: g.solo };
    if (g.members.length === 1) return { kind: 'single', rider: g.members[0] };
    const lat = g.members.reduce((s, m) => s + m.lat, 0) / g.members.length;
    const lng = g.members.reduce((s, m) => s + m.lng, 0) / g.members.length;
    return {
      kind: 'cluster',
      id: `cluster:${g.members.map((m) => m.userId).sort().join('+')}`,
      members: g.members,
      lat,
      lng,
      worst: worstStatus(g.members.map((m) => m.status)),
    };
  });
}

/** Cluster marker outer radius in dp (48 circle + 4 dp ring each side, halved). */
export const CLUSTER_RADIUS_DP = 28;

/**
 * True when my dot (drawn on top of everything) sits within the cluster's radius on screen, so it
 * could hide the centre count. Only then does the cluster show its count in a corner pill.
 */
export function meCoversCluster(
  cluster: { lat: number; lng: number },
  me: { lat: number; lng: number } | null,
  zoom: number,
  radiusDp = CLUSTER_RADIUS_DP,
): boolean {
  if (!me) return false;
  const a = projectDp(cluster.lat, cluster.lng, zoom);
  const b = projectDp(me.lat, me.lng, zoom);
  return Math.hypot(a.x - b.x, a.y - b.y) <= radiusDp;
}

/** An SOS marker is at least this far (dp) from any other rider marker's centre, so it is never covered. */
export const SOS_CLEAR_DP = 52;

/** Inverse of `projectDp`. */
export function unprojectDp(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const world = WORLD_DP_AT_ZOOM_0 * 2 ** zoom;
  const lng = (x / world) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;
  return { lat, lng };
}

/**
 * Display-only nudge: any single or cluster (never me, never SOS) whose centre is closer than
 * `clearDp` to an SOS marker at `zoom` is pushed straight away from it until it is `clearDp` away.
 * A marker exactly on top of the SOS gets a deterministic direction from its position in the list.
 * Selection and press still use the real rider, only the drawn position moves.
 */
export function nudgeFromSos<T extends ClusterRider>(
  items: MapItem<T>[],
  zoom: number,
  clearDp = SOS_CLEAR_DP,
): MapItem<T>[] {
  const sos = items.filter((i): i is { kind: 'single'; rider: T } => i.kind === 'single' && i.rider.status === 'sos');
  if (sos.length === 0) return items;
  const sosPts = sos.map((s) => projectDp(s.rider.lat, s.rider.lng, zoom));
  return items.map((item, index) => {
    if (item.kind === 'single' && (item.rider.isMe || item.rider.status === 'sos')) return item;
    const at = item.kind === 'single' ? item.rider : item;
    let p = projectDp(at.lat, at.lng, zoom);
    let moved = false;
    for (const s of sosPts) {
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d >= clearDp) continue;
      const angle = d < 0.5 ? (index + 1) * 2.4 : Math.atan2(dy, dx);
      p = { x: s.x + Math.cos(angle) * clearDp, y: s.y + Math.sin(angle) * clearDp };
      moved = true;
    }
    if (!moved) return item;
    const { lat, lng } = unprojectDp(p.x, p.y, zoom);
    return item.kind === 'single' ? { kind: 'single', rider: { ...item.rider, lat, lng } } : { ...item, lat, lng };
  });
}

/**
 * Items in draw order (later = on top): riders and clusters, then my dot, then SOS riders last, so an
 * SOS marker is never hidden. Riders near an SOS marker are nudged clear of it first.
 */
export function drawOrder<T extends ClusterRider>(riders: T[], zoom: number): MapItem<T>[] {
  const items = nudgeFromSos(clusterRiders(riders, zoom), zoom);
  const weight = (i: MapItem<T>) => (i.kind === 'cluster' ? 0 : i.rider.status === 'sos' ? 2 : i.rider.isMe ? 1 : 0);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => weight(a.item) - weight(b.item) || a.index - b.index)
    .map((x) => x.item);
}
