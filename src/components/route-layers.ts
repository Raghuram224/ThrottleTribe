// The drawing rules for my route to the stop, shared by the live map and the route preview map so both draw
// identical lines (21 §2.3). Widths, dash and ids live in lib/route-style.ts; this turns them into the layer
// props MapLibre RN takes. The web maps use lib/route-layers-web.ts with the same constants.
import { NAV_CASING_WIDTH, NAV_DASH, NAV_ROUTE_WIDTH } from '@/lib/route-style';

export interface NavRouteColors {
  navRoute: string;
  navRouteCasing: string;
}

/**
 * Casing (solid routes only) and line props. `opacity` below 1 draws an out-of-date route faded (preview "updating"). The straight-line fallback is dashed with butt caps and no casing.
 */
export function navRouteLayerProps(colors: NavRouteColors, dashed: boolean, opacity = 1) {
  return {
    casing: {
      layout: { 'line-cap': 'round', 'line-join': 'round' } as const,
      paint: { 'line-width': NAV_CASING_WIDTH, 'line-color': colors.navRouteCasing, 'line-opacity': opacity },
    },
    line: {
      layout: { 'line-cap': dashed ? 'butt' : 'round', 'line-join': 'round' } as const,
      paint: {
        'line-width': NAV_ROUTE_WIDTH,
        'line-color': colors.navRoute,
        'line-opacity': opacity,
        ...(dashed ? { 'line-dasharray': NAV_DASH } : {}),
      },
    },
  };
}
