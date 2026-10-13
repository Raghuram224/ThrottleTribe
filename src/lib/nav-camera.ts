// Pure maths for the navigation-style live camera (Google Maps "driving mode"). No React, no map SDK.
// Modes: follow (centred on me, heading-up, tilted, zoom by speed), overview (fit every rider) and
// free (the rider moved the map; nothing moves it until they tap Re-centre or Show all).

export type CameraMode = 'follow' | 'overview' | 'free';

export type CameraAction =
  | { type: 'gesture' } // the rider panned, zoomed or rotated
  | { type: 'recenter' } // "Re-centre" control
  | { type: 'showAll' } // "Show all riders" control
  | { type: 'focusRider' }; // a row or marker was tapped: the camera eased to that rider

export function reduceCamera(state: CameraMode, action: CameraAction): CameraMode {
  switch (action.type) {
    case 'gesture':
    case 'focusRider':
      return 'free';
    case 'recenter':
      return 'follow';
    case 'showAll':
      return 'overview';
    default:
      return state;
  }
}

/**
 * What the camera actually does. Without my position there is nothing to follow, so follow falls back
 * to overview; a free camera stays free (the rider chose it).
 */
export function effectiveMode(mode: CameraMode, hasLocation: boolean): CameraMode {
  if (hasLocation) return mode;
  return mode === 'free' ? 'free' : 'overview';
}

// ------------------------------------------------------------------ zoom

/** [km/h, zoom] stops: crawling 17.5, city speeds 16.5, open road 15.5. Linear in between. */
const ZOOM_STOPS: readonly (readonly [number, number])[] = [
  [15, 17.5],
  [30, 16.5],
  [60, 16.5],
  [80, 15.5],
];
export const ZOOM_MAX = 17.5;
export const ZOOM_MIN = 15.5;
/** Zoom when the speed is unknown: between "stopped" and "city". */
export const ZOOM_UNKNOWN_SPEED = 17;

export function zoomForSpeed(kmh: number | null): number {
  if (kmh == null || !Number.isFinite(kmh)) return ZOOM_UNKNOWN_SPEED;
  const first = ZOOM_STOPS[0];
  const last = ZOOM_STOPS[ZOOM_STOPS.length - 1];
  if (kmh <= first[0]) return first[1];
  if (kmh >= last[0]) return last[1];
  for (let i = 1; i < ZOOM_STOPS.length; i++) {
    const [x1, y1] = ZOOM_STOPS[i];
    if (kmh <= x1) {
      const [x0, y0] = ZOOM_STOPS[i - 1];
      return y0 + ((y1 - y0) * (kmh - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** Low-pass towards the target zoom, ignoring changes under `deadband` so the map does not breathe. */
export function smoothZoom(prev: number | null, target: number, alpha = 0.3, deadband = 0.08): number {
  const goal = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target));
  if (prev == null) return goal;
  if (Math.abs(goal - prev) < deadband) return prev;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + (goal - prev) * alpha));
}

// ------------------------------------------------------------------ bearing (heading-up)

/** Course is trusted from this speed up; below EXIT the last bearing is kept (hysteresis: no flapping). */
export const BEARING_ENTER_KMH = 8;
export const BEARING_EXIT_KMH = 5;
/** Course changes smaller than this are ignored (GPS course noise). */
export const BEARING_DEADBAND_DEG = 4;
const BEARING_ALPHA = 0.4;

export interface BearingState {
  bearing: number;
  /** True while the speed is high enough for the GPS course to be trusted. */
  tracking: boolean;
}

export const INITIAL_BEARING: BearingState = { bearing: 0, tracking: false };

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest rotation from `from` to `to`, in -180..180. */
export function shortestDelta(from: number, to: number): number {
  return ((normalizeDeg(to) - normalizeDeg(from) + 540) % 360) - 180;
}

/** expo-location reports -1 (or null) when it has no course. */
export function validCourse(deg: number | null | undefined): deg is number {
  return deg != null && Number.isFinite(deg) && deg >= 0 && deg <= 360;
}

/**
 * Next camera bearing. Moving fast with a valid course: ease towards it along the short way, ignoring
 * jitter. Slow, stopped or no course: keep the last bearing, so the map never spins at a red light.
 */
export function stepBearing(
  state: BearingState,
  input: { courseDeg: number | null | undefined; speedKmh: number | null },
): BearingState {
  const kmh = input.speedKmh ?? 0;
  const tracking = state.tracking ? kmh >= BEARING_EXIT_KMH : kmh >= BEARING_ENTER_KMH;
  const keep = tracking === state.tracking ? state : { bearing: state.bearing, tracking };
  if (!tracking || !validCourse(input.courseDeg)) return keep;
  const delta = shortestDelta(state.bearing, input.courseDeg);
  if (Math.abs(delta) < BEARING_DEADBAND_DEG) return keep;
  return { bearing: normalizeDeg(state.bearing + delta * BEARING_ALPHA), tracking };
}

// ------------------------------------------------------------------ padding

export interface PaddingPx {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Insets {
  /** Height of the map area in dp. */
  areaH: number;
  /** Chrome drawn over the top of the map (convoy strip). */
  topInset: number;
  /** Height of the bottom sheet that is currently visible over the map. */
  bottomInset: number;
}

/** The map must keep at least this much uncovered height, however far the sheet is pulled up. */
export const MIN_VISIBLE_MAP_H = 120;

function clampBottom({ areaH, topInset, bottomInset }: Insets): number {
  return Math.max(0, Math.min(bottomInset, areaH - topInset - MIN_VISIBLE_MAP_H));
}

/**
 * Follow padding: puts my position in the lower third of the part of the map nobody covers. With the
 * visible rectangle V tall, extra top padding V/3 moves the camera centre to 2V/3 from its top.
 */
export function followPadding(insets: Insets): PaddingPx {
  const top = Math.max(0, insets.topInset);
  const bottom = clampBottom(insets);
  const visible = Math.max(MIN_VISIBLE_MAP_H, insets.areaH - top - bottom);
  return { top: Math.round(top + visible / 3), right: 0, bottom: Math.round(bottom), left: 0 };
}

/** Centre in the uncovered part of the map (tap on a rider: the rider lands mid-way between chrome and sheet). */
export function centerPadding(insets: Insets): PaddingPx {
  return { top: Math.round(Math.max(0, insets.topInset)), right: 0, bottom: Math.round(clampBottom(insets)), left: 0 };
}

/** Fit-all padding: markers are up to 56 dp, so keep a 48 dp margin, plus room for the attribution pill. */
export function overviewPadding(insets: Insets): PaddingPx {
  const top = Math.max(0, insets.topInset);
  const bottom = Math.max(0, Math.min(insets.bottomInset, insets.areaH - top - 160));
  return { top: Math.round(top + 48), right: 48, bottom: Math.round(bottom + 48 + 28), left: 48 };
}

/** Pitch for the follow camera. A 2D preference keeps the map flat. */
export const FOLLOW_PITCH = 45;
export function followPitch(tilt: boolean): number {
  return tilt ? FOLLOW_PITCH : 0;
}

/** Each follow update eases for this long (linear), roughly one GPS interval, so motion looks continuous. */
export const FOLLOW_EASE_MS = 1000;
