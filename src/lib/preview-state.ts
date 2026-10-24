// What the route preview shows for the route request (21 §2.3, §2.3.1). Pure, no React.
import type { LatLng } from '@/lib/geo';
import type { NavRoute, NavRouteResult } from '@/lib/nav-route';

export type PreviewRouteState =
  /** No start point yet. */
  | { status: 'locating' }
  | { status: 'loading' }
  /** The switch changed: the previous routes are kept (faded) until the new ones arrive. `route` is `routes[0]`, the router's pick. */
  | { status: 'updating'; route: NavRoute; routes: NavRoute[] }
  | { status: 'ok'; route: NavRoute; routes: NavRoute[] }
  | { status: 'no_route' }
  | { status: 'failed' }
  /** Routes are busy (24 §3.4): `preview.routeBusy` and Try again, no line (the preview never draws a straight one). */
  | { status: 'rate_limited'; retryAfterS: number };

/** The last good answer, with the trip it answered: routes of one trip are never shown for another. */
export interface LastRoutes {
  pair: string;
  routes: NavRoute[];
}

/** One trip: where from and where to. The expressway switch is not part of it (the previous routes stay while it updates). */
export function tripKey(origin: LatLng | null, dest: LatLng): string {
  return origin ? `${origin.lat},${origin.lng}|${dest.lat},${dest.lng}` : '';
}

/** The remembered routes, only if they belong to this trip; otherwise none (a new place starts on its skeleton). */
export function routesForTrip(last: LastRoutes | null, pair: string): NavRoute[] | null {
  return last && pair !== '' && last.pair === pair ? last.routes : null;
}

export interface PreviewStateInput {
  origin: LatLng | null;
  /** The switch as the rider has it, and as last sent to the router (it settles 500 ms after the last tap). */
  avoid: boolean;
  settled: boolean;
  /** The question being asked now, and the latest answer with the question it belongs to. */
  key: string;
  answer: { key: string; result: NavRouteResult } | null;
  /** The last good answer's routes, for the faded lines. */
  lastRoutes: NavRoute[] | null;
}

/**
 * An answer counts only for the question it answered and only once the switch has settled. Until then the
 * previous route stays on screen (`updating`) rather than flashing to a skeleton or a dashed line.
 */
export function previewState({ origin, avoid, settled, key, answer, lastRoutes }: PreviewStateInput): PreviewRouteState {
  if (!origin) return { status: 'locating' };
  if (avoid === settled && answer && answer.key === key) {
    const r = answer.result;
    if (r.status === 'ok') return { status: 'ok', route: r.route, routes: r.routes };
    // A route already drawn is still right: a limit does not take it away.
    if (r.status === 'rate_limited') {
      return lastRoutes ? { status: 'ok', route: lastRoutes[0], routes: lastRoutes } : { status: 'rate_limited', retryAfterS: r.retryAfterS };
    }
    return { status: r.status };
  }
  return lastRoutes ? { status: 'updating', route: lastRoutes[0], routes: lastRoutes } : { status: 'loading' };
}
