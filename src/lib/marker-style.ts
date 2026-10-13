// Shared map-marker visuals (docs/design/14 map section, 15 brand). Plain TS with no React or native
// imports so the native map (ride-map.tsx) and any web map can draw the same markers.
import type { RiderStatus } from '@/lib/rider-status';
import { palette } from '@/theme/tokens';

export const MARKER_STYLE = {
  /** Rider avatar and cluster circle share one size family. */
  avatarDp: 40,
  clusterDp: 44,
  /** White stroke round every marker body. */
  strokeDp: 3,
  strokeColor: palette.markerOutline,
  /** Brand ink: cluster body, outer 1 px stroke round my marker. */
  inkColor: palette.markerStroke,
  clusterTextColor: palette.markerOutline,
  /** Status ring width for stopped / offline / SOS. */
  ringDp: 4,
  /** Me: brand leader arrow (28) when heading is known, orange dot with white stroke (24) otherwise. */
  meColor: palette.me,
  meArrowDp: 28,
  meDotDp: 24,
  /** e2-style lift so markers separate from busy tiles. */
  shadow: { color: '#0B0F14', opacity: 0.3, radius: 6, offsetY: 2, elevation: 5 },
} as const;

/** Status ring colour key, or null when no ring is drawn: a moving rider has none, the map stays quiet. */
export function markerRingStatus(status: RiderStatus): Exclude<RiderStatus, 'moving'> | null {
  return status === 'moving' ? null : status;
}

/** A cluster shows a ring and badge only when its worst member is not moving. */
export function clusterRingStatus(worst: RiderStatus): Exclude<RiderStatus, 'moving'> | null {
  return markerRingStatus(worst);
}

/** Heading is trusted only while actually moving (under ~7 km/h the compass bearing jitters). */
export function meMarkerMode(
  heading: number | null,
  speedMps: number | null,
): { kind: 'arrow'; rotationDeg: number } | { kind: 'dot' } {
  if (heading === null || !Number.isFinite(heading) || (speedMps ?? 0) <= 2) return { kind: 'dot' };
  return { kind: 'arrow', rotationDeg: ((heading % 360) + 360) % 360 };
}

// ---------------------------------------------------------------- Maps-style me marker (17 §2)

export const HALO_MIN_DP = 40;
export const HALO_MAX_DP = 160;
export const HALO_UNKNOWN_DP = 72;
/** 3 km/h: below this the compass bearing is noise and no cone is drawn. */
export const CONE_MIN_SPEED_MPS = 3 / 3.6;

/** Metres per dp at `zoom` and latitude (512 px tiles, as MapLibre uses). */
export function metersPerDp(lat: number, zoom: number): number {
  return (78_271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Accuracy halo diameter in dp: GPS accuracy at the current zoom, clamped to 40-160; 72 when unknown. */
export function haloDiameterDp(accuracyM: number | null, lat: number, zoom: number): number {
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM <= 0) return HALO_UNKNOWN_DP;
  const d = (accuracyM * 2) / metersPerDp(lat, zoom);
  return Math.round(Math.min(HALO_MAX_DP, Math.max(HALO_MIN_DP, d)));
}

/** Heading cone: only with a known heading and a real speed. Returns the rotation, or null. */
export function coneRotation(heading: number | null, speedMps: number | null): number | null {
  if (heading === null || !Number.isFinite(heading) || (speedMps ?? 0) < CONE_MIN_SPEED_MPS) return null;
  return ((heading % 360) + 360) % 360;
}
