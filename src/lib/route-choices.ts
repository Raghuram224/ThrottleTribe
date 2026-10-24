// The route preview's choices (docs/design/28 §routes): the labels of the choice row, which route is drawn on top, and
// where each route's duration label sits on the map. Pure, no React.
import { copy, spokenDistance, spokenDuration, t } from '@/lib/copy';
import { formatClockTime, formatDistance, formatDuration } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';

interface RouteLike {
  coords: readonly LatLng[];
  distanceM: number;
  durationS: number;
}

/** A selection that fell outside the list (new routes arrived) is the first route. */
export function clampRouteIndex(index: number, count: number): number {
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

export interface RouteChoice {
  index: number;
  /** "42 min" */
  duration: string;
  /** "31 km" */
  distance: string;
  /** "42 min · 31 km" */
  label: string;
  /** "6:42 pm" */
  arrive: string;
  /** The router's pick: tagged "Fastest". */
  fastest: boolean;
  /** One spoken line, no glyphs: duration, distance, arrive time and the tag. */
  a11y: string;
}

/** The choice row's content, one entry per route; the first is the router's recommendation ("Fastest"). */
export function routeChoices(routes: readonly Pick<RouteLike, 'distanceM' | 'durationS'>[], nowMs: number): RouteChoice[] {
  return routes.map((r, index) => {
    const duration = formatDuration(r.durationS * 1000);
    const distance = formatDistance(r.distanceM);
    const arrive = formatClockTime(nowMs + r.durationS * 1000);
    const fastest = index === 0;
    return {
      index,
      duration,
      distance,
      label: t('route.choiceLabel', { duration, distance }),
      arrive,
      fastest,
      a11y: t('route.choiceA11y', {
        duration: spokenDuration(r.durationS * 1000),
        distance: spokenDistance(distance),
        time: arrive,
        tag: fastest ? ` ${copy['route.fastest']}.` : '',
      }),
    };
  });
}

/** One line of the map: its route index and whether it is the chosen one. Unselected first, so the chosen is drawn last (on top). */
export interface MapRouteView {
  index: number;
  coords: readonly LatLng[];
  selected: boolean;
}

export function mapRouteViews(routes: readonly Pick<RouteLike, 'coords'>[], selected: number): MapRouteView[] {
  const sel = clampRouteIndex(selected, routes.length);
  const views = routes.map((r, index) => ({ index, coords: r.coords, selected: index === sel }));
  return [...views.filter((v) => !v.selected), ...views.filter((v) => v.selected)];
}

// ---------------------------------------------------------------- duration label anchors

/** Where along a route a label may sit: dense, so the point farthest from the other routes is found closely. */
const CANDIDATE_FRACTIONS = Array.from({ length: 17 }, (_, i) => 0.1 + i * 0.05);
/** Two labels closer than this overlap on a phone at route zoom, whatever the extent. */
export const LABEL_MIN_GAP_M = 400;
/** ...and the preview fits all routes on screen, so the gap also scales with their extent (a pill is about 1/8 of the width). */
const LABEL_GAP_OF_EXTENT = 0.12;
const OTHER_SAMPLE = 300;

function cumulative(coords: readonly LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]));
  return out;
}

function pointAt(coords: readonly LatLng[], cum: readonly number[], fraction: number): LatLng {
  const target = cum[cum.length - 1] * fraction;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const span = cum[i] - cum[i - 1];
  const k = span > 0 ? (target - cum[i - 1]) / span : 0;
  const a = coords[i - 1];
  const b = coords[i];
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
}

/** Evenly spaced along the route (not every Nth vertex): the others' line is sampled at about the same spacing everywhere. */
function sampleAlong(coords: readonly LatLng[], cum: readonly number[]): LatLng[] {
  return Array.from({ length: OTHER_SAMPLE + 1 }, (_, i) => pointAt(coords, cum, i / OTHER_SAMPLE));
}

/**
 * A point on each route for its duration label, "where the lines differ" (Google Maps): of the candidates along the
 * route, the one farthest from the other routes. Labels must not overlap: a candidate within the gap (400 m, or 12% of the
 * routes' extent, whichever is more) of a label already placed is skipped; when none is clear the best one is nudged
 * north by the gap, once per conflict, so the pills stack apart instead of on top of each other. One route: its middle.
 * Routes of fewer than two points get null.
 */
export function routeLabelAnchors(routes: readonly Pick<RouteLike, 'coords'>[]): (LatLng | null)[] {
  const cums = routes.map((r) => (r.coords.length >= 2 ? cumulative(r.coords) : []));
  const samples = routes.map((r, i) => (cums[i].length ? sampleAlong(r.coords, cums[i]) : []));
  const all = routes.flatMap((r) => (r.coords.length >= 2 ? r.coords : []));
  const extentM = all.length ? Math.max(...all.map((p) => haversineM(all[0], p))) : 0;
  const gap = Math.max(LABEL_MIN_GAP_M, extentM * LABEL_GAP_OF_EXTENT);
  const placed: LatLng[] = [];
  return routes.map((r, i) => {
    if (r.coords.length < 2) return null;
    if (routes.length === 1) return pointAt(r.coords, cums[i], 0.5);
    const scored = CANDIDATE_FRACTIONS.map((f) => {
      const p = pointAt(r.coords, cums[i], f);
      let apart = Infinity;
      samples.forEach((o, j) => {
        if (j === i) return;
        for (const q of o) apart = Math.min(apart, haversineM(p, q));
      });
      return { p, apart };
    }).sort((a, b) => b.apart - a.apart);
    const clear = scored.find((c) => placed.every((q) => haversineM(c.p, q) >= gap));
    let pick = (clear ?? scored[0]).p;
    if (!clear) {
      // Nudge north until it is clear of every label placed (bounded: at most one step per label).
      for (let n = 0; n < placed.length && placed.some((q) => haversineM(pick, q) < gap); n++) {
        pick = { lat: pick.lat + gap / 111_320, lng: pick.lng };
      }
    }
    placed.push(pick);
    return pick;
  });
}
