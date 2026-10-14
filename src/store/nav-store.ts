import { create } from 'zustand';

import type { LatLng } from '@/lib/geo';
import { decodeArrival, encodeArrival, NO_ARRIVAL, type ArrivalLatch } from '@/lib/nav-arrival';
import { EMPTY_ENGINE, type NavEngineState } from '@/lib/nav-engine';
import { encodeVoicePref, parseVoicePref } from '@/lib/nav-voice';
import type { NavRoute } from '@/lib/nav-route';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** A start point older than this is not "where I am" any more (the preview then waits for a fresh fix). */
export const ORIGIN_MAX_AGE_MS = 2 * 60_000;

interface NavState {
  /** Last position seen on Where to? / the preview, so the preview can route at once (21 §2.2). Memory only. */
  origin: LatLng | null;
  /** `Date.now()` when `origin` was recorded. */
  originAt: number;
  setOrigin: (p: LatLng | null) => void;
  /** The preview's route, handed to the live ride so it does not fetch the same route again (21 §2.3). */
  seeded: { key: string; route: NavRoute } | null;
  /**
   * The expressway choice made on the preview, carried into the live ride so reroutes honour it.
   * Null = no preview was involved (cold start, in-ride Go here): the saved preference decides.
   */
  avoidMotorways: boolean | null;
  /** The ride the session above belongs to; its layout is the only one that may clear it. */
  sessionRideId: string | null;
  /** Called at Go, with the ride just created. */
  startSession: (rideId: string, seed: { key: string; route: NavRoute } | null, avoidMotorways: boolean) => void;
  /**
   * Solo arrival latch for the current destination (21 §2.8), and the ride it belongs to. An "arrived"
   * latch is also kept in local storage, so leaving the ride screens (Back to Home) or a cold start does not
   * forget that I already got there.
   */
  arrival: ArrivalLatch;
  arrivalRideId: string | null;
  setArrival: (rideId: string, a: ArrivalLatch) => void;
  /** The ride ended (or I left it): forget its latch. A different ride's latch is left alone. */
  clearArrival: (rideId: string) => void;
  /**
   * The navigation engine's state (21 §3 intro): written only by `navSession` (lib/nav-session.ts), read by the
   * screens. Memory only.
   */
  engine: NavEngineState;
  /** The one arrival announced so far (`rideId|key`): memory only. */
  announcedArrival: string;
  /**
   * True the first time it is asked for this ride and destination, false after. The engine and the live screen both
   * detect arrival; whichever is first announces it (haptic + telemetry), the other finds it claimed (L3).
   */
  claimArrivalAnnouncement: (rideId: string, key: string) => boolean;
  /**
   * Voice directions wanted (21 §4.4). Persisted on this phone (`pref.navVoice`, default on) and read by the
   * engine in the foreground and the background alike, so muting before locking the phone keeps it silent.
   */
  voiceOn: boolean;
  setVoiceOn: (on: boolean) => void;
  /** Leaving the ride screens: the preview route and expressway choice go (the origin and the latch stay). */
  resetSession: (rideId: string) => void;
}

const stored = decodeArrival(readItem(STORAGE_KEYS.navArrival));

export const useNavStore = create<NavState>((set, get) => ({
  origin: null,
  originAt: 0,
  setOrigin: (origin) => set({ origin, originAt: Date.now() }),
  seeded: null,
  avoidMotorways: null,
  sessionRideId: null,
  startSession: (rideId, seeded, avoidMotorways) => {
    writeItem(STORAGE_KEYS.navArrival, null);
    set({ seeded, avoidMotorways, sessionRideId: rideId, arrival: NO_ARRIVAL, arrivalRideId: null, announcedArrival: '' });
  },
  engine: EMPTY_ENGINE,
  voiceOn: parseVoicePref(readItem(STORAGE_KEYS.navVoice)),
  setVoiceOn: (on) => {
    writeItem(STORAGE_KEYS.navVoice, encodeVoicePref(on));
    set({ voiceOn: on });
  },
  arrival: stored ? { key: stored.key, state: 'arrived' } : NO_ARRIVAL,
  arrivalRideId: stored?.rideId ?? null,
  announcedArrival: '',
  claimArrivalAnnouncement: (rideId, key) => {
    const id = `${rideId}|${key}`;
    if (get().announcedArrival === id) return false;
    set({ announcedArrival: id });
    return true;
  },
  setArrival: (rideId, arrival) => {
    const raw = encodeArrival(rideId, arrival);
    if (raw) writeItem(STORAGE_KEYS.navArrival, raw);
    else if (decodeArrival(readItem(STORAGE_KEYS.navArrival))?.rideId === rideId) writeItem(STORAGE_KEYS.navArrival, null);
    set({ arrival, arrivalRideId: rideId });
  },
  clearArrival: (rideId) => {
    if (get().arrivalRideId === rideId) set({ arrival: NO_ARRIVAL, arrivalRideId: null });
    if (decodeArrival(readItem(STORAGE_KEYS.navArrival))?.rideId === rideId) writeItem(STORAGE_KEYS.navArrival, null);
  },
  resetSession: (rideId) => {
    if (get().sessionRideId === rideId) set({ seeded: null, avoidMotorways: null, sessionRideId: null });
  },
}));

/** The latch as it applies to this ride (the store may hold another ride's). */
export function arrivalForRide(s: Pick<NavState, 'arrival' | 'arrivalRideId'>, rideId: string): ArrivalLatch {
  return s.arrivalRideId === rideId ? s.arrival : NO_ARRIVAL;
}

/** The remembered start point, or null once it is older than 2 minutes. */
export function freshOrigin(s: Pick<NavState, 'origin' | 'originAt'>, now: number): LatLng | null {
  return s.origin && now - s.originAt <= ORIGIN_MAX_AGE_MS ? s.origin : null;
}

/** `freshOrigin` for right now (kept out of render code so it stays pure there). */
export function readFreshOrigin(): LatLng | null {
  return freshOrigin(useNavStore.getState(), Date.now());
}
