// What the route preview shows for the route request (21 §2.3, §2.3.1). Pure, no React.
import type { LatLng } from '@/lib/geo';
import type { NavRoute, NavRouteResult } from '@/lib/nav-route';

export type PreviewRouteState =
  /** No start point yet. */
  | { status: 'locating' }
  | { status: 'loading' }
  /** The switch changed: the previous route is kept (faded) until the new one arrives. */
  | { status: 'updating'; route: NavRoute }
  | { status: 'ok'; route: NavRoute }
  | { status: 'no_route' }
  | { status: 'failed' };

export interface PreviewStateInput {
  origin: LatLng | null;
  /** The switch as the rider has it, and as last sent to the router (it settles 500 ms after the last tap). */
  avoid: boolean;
  settled: boolean;
  /** The question being asked now, and the latest answer with the question it belongs to. */
  key: string;
  answer: { key: string; result: NavRouteResult } | null;
  /** The last good route, for the faded line. */
  lastRoute: NavRoute | null;
}

/**
 * An answer counts only for the question it answered and only once the switch has settled. Until then the
 * previous route stays on screen (`updating`) rather than flashing to a skeleton or a dashed line.
 */
export function previewState({ origin, avoid, settled, key, answer, lastRoute }: PreviewStateInput): PreviewRouteState {
  if (!origin) return { status: 'locating' };
  if (avoid === settled && answer && answer.key === key) {
    return answer.result.status === 'ok' ? { status: 'ok', route: answer.result.route } : { status: answer.result.status };
  }
  return lastRoute ? { status: 'updating', route: lastRoute } : { status: 'loading' };
}
