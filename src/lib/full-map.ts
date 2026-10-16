// Pure decisions for the full-map live screen and the solo ride (19 §B, §C). No React.
/** The speed bubble shows nothing under this. */
export const MIN_SHOWN_KMH = 3;

/** Whole km/h from m/s, or null when unknown or crawling (< 3 km/h). */
export function shownSpeedKmh(mps: number | null | undefined): number | null {
  return mps != null && Number.isFinite(mps) && mps * 3.6 >= MIN_SHOWN_KMH ? Math.round(mps * 3.6) : null;
}

/** Android hardware back: full map is left first; otherwise the screen's normal back behaviour runs. */
export function backAction(fullMap: boolean): 'exit-full-map' | 'default' {
  return fullMap ? 'exit-full-map' : 'default';
}

// No rule opens full map by itself (22 D6): every ride, a free Just ride included, opens in the normal sheet view, so the
// Invite riders row and the header menu are visible from the first second. Full map is one tap away (the toggle).
