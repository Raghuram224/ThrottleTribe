// Arrival detection for solo navigation (docs/design/21 §2.8, §3.9). Pure, no React.
// It latches per destination and never un-latches on its own: nothing is acted on automatically.
import { ARRIVED_WITHIN_M } from '@/lib/nav-route';
import { haversineM, type LatLng } from '@/lib/geo';

export type ArrivalState = 'navigating' | 'arrived';

/** A fix this inaccurate says nothing about arriving. */
export const ARRIVAL_MAX_ACCURACY_M = 100;
/** Rule (b): within this of the snapped `arrive` maneuver (P2 supplies it). */
export const ARRIVE_AT_WITHIN_M = 40;
/** Rule (c): on the final step with this little road left (P2 supplies it). */
export const FINAL_STEP_REMAINING_M = 30;

export interface ArrivalInput {
  me: LatLng | null;
  accuracyM: number | null;
  dest: LatLng;
  /** Rule (b): the snapped `arrive` maneuver location. Not available in P1. */
  arriveAt?: LatLng | null;
  /** Rule (c): route metres left. Not available in P1. */
  remainingAlongM?: number | null;
  onFinalStep?: boolean;
}

/**
 * 'arrived' once any rule holds: (a) within 150 m of the destination, (b) within 40 m of the arrive
 * maneuver, (c) on the final step with at most 30 m left. `prev === 'arrived'` stays arrived. No fix, or a fix
 * worse than 100 m, keeps `prev`. P1 feeds rule (a) only.
 */
export function arrivalState(prev: ArrivalState, a: ArrivalInput): ArrivalState {
  if (prev === 'arrived') return 'arrived';
  if (!a.me || (a.accuracyM != null && a.accuracyM > ARRIVAL_MAX_ACCURACY_M)) return prev;
  if (haversineM(a.me, a.dest) <= ARRIVED_WITHIN_M) return 'arrived';
  if (a.arriveAt && haversineM(a.me, a.arriveAt) <= ARRIVE_AT_WITHIN_M) return 'arrived';
  if (a.onFinalStep && a.remainingAlongM != null && a.remainingAlongM <= FINAL_STEP_REMAINING_M) return 'arrived';
  return prev;
}

/** Destination identity: the same string `useNavRoute` keys its route by. */
export function destKey(dest: LatLng | null): string {
  return dest ? `${dest.lat},${dest.lng}` : '';
}

export interface ArrivalLatch {
  key: string;
  state: ArrivalState;
}

export const NO_ARRIVAL: ArrivalLatch = { key: '', state: 'navigating' };

/**
 * One step of the per-destination latch. A different destination (or none) starts over; the same one
 * keeps its state. Returns the same object when nothing changed, so callers can compare by identity.
 */
export function nextLatch(latch: ArrivalLatch, dest: LatLng | null, input: Omit<ArrivalInput, 'dest'>): ArrivalLatch {
  const key = destKey(dest);
  if (!dest) return latch.key === '' && latch.state === 'navigating' ? latch : NO_ARRIVAL;
  const base: ArrivalLatch = latch.key === key ? latch : { key, state: 'navigating' };
  const state = arrivalState(base.state, { ...input, dest });
  if (base === latch && state === latch.state) return latch;
  return { key, state };
}

/** Whether the latch says "arrived" for this destination. */
export function isArrived(latch: ArrivalLatch, dest: LatLng | null): boolean {
  return !!dest && latch.state === 'arrived' && latch.key === destKey(dest);
}

/**
 * One live-screen update of the latch. The stop always goes in (also in a group ride), so riders joining or
 * leaving never reset it; only the solo variant announces (haptic + `nav.arrived`) and shows the panel.
 */
export function latchStep(
  prev: ArrivalLatch,
  dest: LatLng | null,
  input: Omit<ArrivalInput, 'dest'>,
  solo: boolean,
): { latch: ArrivalLatch; announce: boolean } {
  const latch = nextLatch(prev, dest, input);
  return { latch, announce: solo && latch !== prev && latch.state === 'arrived' };
}

// ---------------------------------------------------------------- persistence

/** What is stored: only an "arrived" latch, with the ride it belongs to. */
export interface StoredArrival {
  rideId: string;
  key: string;
}

/** The JSON to store, or null when there is nothing to keep (not arrived, or no ride). */
export function encodeArrival(rideId: string | null, latch: ArrivalLatch): string | null {
  if (!rideId || latch.state !== 'arrived' || !latch.key) return null;
  const stored: StoredArrival = { rideId, key: latch.key };
  return JSON.stringify(stored);
}

/** Reads the stored JSON; anything unexpected is "nothing stored". */
export function decodeArrival(raw: string | null | undefined): StoredArrival | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredArrival> | null;
    return v && typeof v.rideId === 'string' && v.rideId && typeof v.key === 'string' && v.key
      ? { rideId: v.rideId, key: v.key }
      : null;
  } catch {
    return null;
  }
}
