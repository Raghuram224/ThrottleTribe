// What the route preview camera frames, and the room the floating chrome takes (21 §2.3). Pure.
import { pillHeight, type PillLines } from '@/lib/credits';
import type { LatLng } from '@/lib/geo';

export interface PreviewPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Floating back circle: 56 at top = insets.top + 8, then 24 of air. */
export const PREVIEW_BACK_BOTTOM = 8 + 56 + 24;
/** Attribution pill above the panel (12 text) plus its margin. */
export const PREVIEW_ATTRIBUTION_H = 28;
export const PREVIEW_SIDE = 48;

/**
 * Fit padding (the preview's version of the 20 C2 rule: everything floating over the map is counted): top
 * clears the back button, bottom clears the panel, 24 of air and the attribution; sides 48.
 */
export function previewPadding(insetTop: number, panelH: number, creditLines: PillLines = 1, fontScale = 1): PreviewPadding {
  return {
    top: insetTop + PREVIEW_BACK_BOTTOM,
    // PREVIEW_ATTRIBUTION_H (28) is the one-line pill plus 4; a taller pill (Terrain) grows it.
    bottom: panelH + 24 + (pillHeight(creditLines, fontScale) - pillHeight(1) + PREVIEW_ATTRIBUTION_H),
    left: PREVIEW_SIDE,
    right: PREVIEW_SIDE,
  };
}

/**
 * The points the camera must keep in view: every road route (the chosen one and the grey alternatives), else me and the
 * destination (while the routes load, or when none came), else nothing. Never a straight line between them.
 */
export function previewFitPoints(routes: readonly { coords: readonly LatLng[] }[], me: LatLng | null, dest: LatLng): LatLng[] {
  const drawn = routes.filter((r) => r.coords.length >= 2);
  if (drawn.length > 0) return drawn.flatMap((r) => r.coords);
  return me ? [me, dest] : [];
}

/** The search results the camera frames: all of them; one alone gets my position beside it so the view has a scale. */
export function resultsFitPoints(places: readonly LatLng[], me: LatLng | null): LatLng[] {
  if (places.length === 0) return [];
  if (places.length === 1 && me) return [places[0], me];
  return [...places];
}
