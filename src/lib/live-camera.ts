// The live map's first frame (docs/design/06 §3): pure choice, no React, no native modules.
import type { LatLng } from '@/lib/geo';
import type { Bounds } from '@/lib/map-fit';
import { HOME_FALLBACK_CAMERA, type PlanCamera } from '@/lib/plan-flow';

/** An older planning fix says little about where the ride starts: Home's camera is the better guess then. */
export const PLANNING_SEED_MAX_AGE_MS = 30 * 60_000;

/** Street level, where the follow camera starts. */
export const LIVE_ME_ZOOM = 16.5;

export type LiveStartView =
  | { kind: 'me'; center: [lng: number, lat: number]; zoom: number }
  | { kind: 'bounds'; bounds: Bounds }
  /** The planning position: close in like my own fix, tilted the same way. */
  | { kind: 'planning'; center: [lng: number, lat: number]; zoom: number }
  /** Home's last camera, or India: flat, at the zoom Home had. */
  | { kind: 'saved'; center: [lng: number, lat: number]; zoom: number };

/**
 * What the map shows before it has anything live of mine: my own fix, else everyone with a position, else where
 * the app knew me a moment ago (the fix Home planned from, up to 30 min old), else Home's last camera, else India. Never the open ocean:
 * a ride used to start on a black map for 10-15 s until the first background fix arrived.
 */
export function liveStartView(o: {
  me: LatLng | null;
  /** Fit bounds of everyone with a position (null = nobody). */
  bounds: Bounds | null;
  /** The planning position (`nav-store.origin`) and when it was recorded (`originAt`, ms). */
  planning: LatLng | null;
  planningAt: number;
  now: number;
  /** Home's saved browse camera. */
  saved: PlanCamera | null;
}): LiveStartView {
  if (o.me) return { kind: 'me', center: [o.me.lng, o.me.lat], zoom: LIVE_ME_ZOOM };
  if (o.bounds) return { kind: 'bounds', bounds: o.bounds };
  if (o.planning && o.now - o.planningAt <= PLANNING_SEED_MAX_AGE_MS) return { kind: 'planning', center: [o.planning.lng, o.planning.lat], zoom: LIVE_ME_ZOOM };
  const c = o.saved ?? HOME_FALLBACK_CAMERA;
  return { kind: 'saved', center: [c.lng, c.lat], zoom: c.zoom };
}
