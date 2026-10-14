// OSRM turn steps as a maneuver model (docs/design/21 §3.2, §3.3). Pure, no React.
import type { LatLng } from '@/lib/geo';

export type ManeuverType =
  | 'turn'
  | 'new name'
  | 'depart'
  | 'arrive'
  | 'merge'
  | 'on ramp'
  | 'off ramp'
  | 'fork'
  | 'end of road'
  | 'continue'
  | 'roundabout'
  | 'rotary'
  | 'roundabout turn'
  | 'notification'
  | 'exit roundabout'
  | 'exit rotary'
  | 'use lane'
  | 'ramp'
  | 'unknown';

export type Modifier =
  | 'uturn'
  | 'sharp right'
  | 'right'
  | 'slight right'
  | 'straight'
  | 'slight left'
  | 'left'
  | 'sharp left';

export interface NavStep {
  type: ManeuverType;
  modifier: Modifier | null;
  /** Roundabout exit number; null when the step has none. */
  exit: number | null;
  name: string;
  ref: string;
  destinations: string;
  exits: string;
  rotaryName: string;
  location: LatLng;
  /** Length of the step itself (metres, as OSRM reports it). */
  distanceM: number;
  drivingSide: 'left' | 'right';
  /** Route distance from the start to this maneuver, scaled to the overview geometry. */
  alongM: number;
}

const TYPES: readonly ManeuverType[] = [
  'turn', 'new name', 'depart', 'arrive', 'merge', 'on ramp', 'off ramp', 'fork', 'end of road', 'continue',
  'roundabout', 'rotary', 'roundabout turn', 'notification', 'exit roundabout', 'exit rotary', 'use lane', 'ramp',
];
const MODIFIERS: readonly Modifier[] = [
  'uturn', 'sharp right', 'right', 'slight right', 'straight', 'slight left', 'left', 'sharp left',
];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Parses `routes[0].legs[*].steps[]`. An unknown type becomes 'unknown' and an unknown modifier null; a step with
 * no valid location is dropped. Undefined when the route holds no steps at all (a route fetched without
 * `steps=true`), so P1-style routes still parse. `trailTotalM` is the overview geometry's length: step
 * distances are scaled to it so `alongM` lines up with what progress projects onto.
 */
export function parseSteps(legs: unknown, trailTotalM: number): NavStep[] | undefined {
  if (!Array.isArray(legs)) return undefined;
  const raw: Record<string, unknown>[] = [];
  for (const leg of legs) {
    const steps = (leg as { steps?: unknown } | null)?.steps;
    if (Array.isArray(steps)) for (const s of steps) if (s && typeof s === 'object') raw.push(s as Record<string, unknown>);
  }
  const parsed: Omit<NavStep, 'alongM'>[] = [];
  for (const s of raw) {
    const m = (s.maneuver ?? {}) as Record<string, unknown>;
    const loc = m.location;
    if (!Array.isArray(loc) || num(loc[0]) === null || num(loc[1]) === null) continue;
    const type = (TYPES as readonly string[]).includes(m.type as string) ? (m.type as ManeuverType) : 'unknown';
    const modifier = (MODIFIERS as readonly string[]).includes(m.modifier as string) ? (m.modifier as Modifier) : null;
    const exit = num(m.exit);
    parsed.push({
      type,
      modifier,
      exit: exit !== null && exit >= 1 ? Math.round(exit) : null,
      name: str(s.name),
      ref: str(s.ref),
      destinations: str(s.destinations),
      exits: str(s.exits),
      rotaryName: str(s.rotary_name),
      location: { lat: loc[1] as number, lng: loc[0] as number },
      distanceM: Math.max(0, num(s.distance) ?? 0),
      drivingSide: s.driving_side === 'left' ? 'left' : 'right',
    });
  }
  if (parsed.length === 0) return undefined;
  return withAlong(parsed, trailTotalM);
}

/** alongM[0] = 0, alongM[i] = sum of the earlier step distances x scale (trail length / sum of distances). */
export function withAlong(steps: readonly Omit<NavStep, 'alongM'>[], trailTotalM: number): NavStep[] {
  const sum = steps.reduce((a, s) => a + s.distanceM, 0);
  const scale = sum > 0 ? trailTotalM / sum : 1;
  let acc = 0;
  return steps.map((s) => {
    const out: NavStep = { ...s, alongM: acc };
    acc += s.distanceM * scale;
    return out;
  });
}

const SIDE_TURNS: readonly Modifier[] = ['left', 'right', 'sharp left', 'sharp right', 'uturn'];

/** Whether the rider is told about this step (§3.3). */
export function isAnnounced(step: Pick<NavStep, 'type' | 'modifier'>): boolean {
  switch (step.type) {
    case 'depart':
    case 'notification':
    case 'exit roundabout':
    case 'exit rotary':
      return false;
    case 'new name':
      return step.modifier !== null && SIDE_TURNS.includes(step.modifier);
    case 'continue':
    case 'use lane':
      return step.modifier !== null && step.modifier !== 'straight';
    case 'unknown':
      return step.modifier !== null;
    default:
      return true;
  }
}

/** The type a step is rendered as (§3.3 "Treated as"). Only meaningful for announced steps. */
export function treatedAs(step: Pick<NavStep, 'type'>): ManeuverType {
  switch (step.type) {
    case 'new name':
    case 'unknown':
      return 'turn';
    case 'use lane':
      return 'continue';
    case 'ramp':
      return 'on ramp';
    default:
      return step.type;
  }
}

/**
 * The announced steps, always ending with the `arrive` step (synthesised at `end` when OSRM omitted it, which
 * also drops anything announced after a stray arrive). All progress indices refer to this list.
 */
export function announcedSteps(steps: readonly NavStep[] | undefined, end: LatLng, totalM: number): NavStep[] {
  const out = (steps ?? []).filter(isAnnounced);
  const arriveAt = out.findIndex((s) => s.type === 'arrive');
  if (arriveAt >= 0) return out.slice(0, arriveAt + 1);
  const last = steps?.[steps.length - 1];
  out.push({
    type: 'arrive',
    modifier: null,
    exit: null,
    name: '',
    ref: '',
    destinations: '',
    exits: '',
    rotaryName: '',
    location: end,
    distanceM: 0,
    drivingSide: last?.drivingSide ?? 'right',
    alongM: totalM,
  });
  return out;
}
