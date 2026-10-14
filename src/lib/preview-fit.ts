// What the route preview camera frames, and the room the floating chrome takes (21 §2.3). Pure.
import type { LatLng } from '@/lib/geo';
import type { NavLine } from '@/lib/stop-ui';

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
export function previewPadding(insetTop: number, panelH: number): PreviewPadding {
  return {
    top: insetTop + PREVIEW_BACK_BOTTOM,
    bottom: panelH + 24 + PREVIEW_ATTRIBUTION_H,
    left: PREVIEW_SIDE,
    right: PREVIEW_SIDE,
  };
}

/** The points the camera must keep in view: the road route, else me and the destination, else nothing. */
export function previewFitPoints(line: NavLine | null, me: LatLng | null, dest: LatLng): LatLng[] {
  if (line && !line.dashed && line.coords.length >= 2) return line.coords;
  return me ? [me, dest] : [];
}
