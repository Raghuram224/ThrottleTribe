// Pure rules for the ride view on Home's map (docs/design/28 §8): which circles the bottom-right stack shows. No React.
import { FAB_STACK } from '@/lib/plan-flow';

/** Top to bottom, as they are drawn. */
export type RideStackItem = 'fitAll' | 'fullMap' | 'message' | 'search' | 'speak' | 'sos';

const DRAW_ORDER: readonly RideStackItem[] = ['fitAll', 'fullMap', 'message', 'search', 'speak', 'sos'];
/** Which circle goes first when the map is too short for all of them: safety first, the view controls last. */
const KEEP_ORDER: readonly RideStackItem[] = ['sos', 'search', 'speak', 'message', 'fullMap', 'fitAll'];

/** 12 dp above the first circle and under the last, plus the 28 dp the attribution takes (as the old two-circle column: 176 for two). */
const STACK_MARGIN = 12 + 12 + 28;
const STEP = FAB_STACK.size + FAB_STACK.gap;

/** Visible map height needed to show `n` circles. */
export function rideStackMinMapH(n: number): number {
  return n * STEP + STACK_MARGIN - FAB_STACK.gap;
}

export interface RideStackInput {
  /** Map left visible above the sheet and under the top chrome. */
  mapVisH: number;
  /** A group ride has riders to message; a ride of one has not. */
  group: boolean;
  /** Turn-by-turn navigation is on: "Speak" (voice guidance) has something to govern. */
  navActive: boolean;
  /** Two or more riders have a position: "all riders" is more than me. */
  fitAll: boolean;
}

/**
 * The circles of the ride view's stack, top to bottom. SOS is always there, then Search, Speak (only while navigating),
 * Message (group rides), the full-map toggle and fit-all. When the visible map is too short for all of them the ones last
 * in `KEEP_ORDER` go first, so a tall sheet or a small phone never costs the rider SOS or Search.
 */
export function rideStackItems(i: RideStackInput): RideStackItem[] {
  const wanted = new Set<RideStackItem>(['sos', 'search', 'fullMap']);
  if (i.navActive) wanted.add('speak');
  if (i.group) wanted.add('message');
  if (i.fitAll) wanted.add('fitAll');
  const room = Math.max(1, Math.floor((i.mapVisH - STACK_MARGIN + FAB_STACK.gap) / STEP));
  const kept = KEEP_ORDER.filter((k) => wanted.has(k)).slice(0, room);
  return DRAW_ORDER.filter((k) => kept.includes(k));
}
