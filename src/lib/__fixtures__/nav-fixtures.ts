// Shared builders for the navigation tests: a straight road running east at 12 N, steps placed by route distance.
import type { LatLng } from '../geo';
import type { NavFix, PreparedRoute } from '../nav-progress';
import { prepareRoute } from '../nav-progress';
import type { NavRoute } from '../nav-route';
import type { ManeuverType, Modifier, NavStep } from '../nav-steps';

export const M_PER_DEG_LAT = 111_194.9;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((12 * Math.PI) / 180);

/** A point `eastM` metres east of the origin and `northM` north of the road. */
export const at = (eastM: number, northM = 0): LatLng => ({ lat: 12 + northM / M_PER_DEG_LAT, lng: 77 + eastM / M_PER_DEG_LNG });

export function step(type: ManeuverType, modifier: Modifier | null, alongM: number, extra: Partial<NavStep> = {}): NavStep {
  return {
    type,
    modifier,
    exit: null,
    name: '',
    ref: '',
    destinations: '',
    exits: '',
    rotaryName: '',
    location: at(alongM),
    distanceM: 0,
    drivingSide: 'right',
    alongM,
    ...extra,
  };
}

/** A straight road of `totalM` with a point every 50 m; steps at the given distances, then arrive at the end. */
export function straightRoute(totalM: number, steps: [number, ManeuverType, Modifier | null][]): NavRoute {
  const coords: LatLng[] = [];
  for (let m = 0; m <= totalM; m += 50) coords.push(at(m));
  return {
    coords,
    distanceM: totalM,
    durationS: totalM / 15,
    steps: [step('depart', null, 0), ...steps.map(([m, t, mod]) => step(t, mod, m)), step('arrive', null, totalM)],
  };
}

export const prepared = (route: NavRoute, id = 1): PreparedRoute => prepareRoute(route, id);

export function fix(eastM: number, over: Partial<NavFix> & { northM?: number } = {}): NavFix {
  const { northM = 0, ...rest } = over;
  const p = at(eastM, northM);
  return { lat: p.lat, lng: p.lng, accuracyM: 5, speedMps: 15, courseDeg: 90, t: 1_000_000 + eastM, ...rest };
}
