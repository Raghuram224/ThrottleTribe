import { MARKER_STYLE } from '@/lib/marker-style';

/** Native shadow style that lifts an opaque marker body off busy map tiles. */
export function markerLiftStyle() {
  const { color, opacity, radius, offsetY, elevation } = MARKER_STYLE.shadow;
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: offsetY },
    elevation,
  } as const;
}
