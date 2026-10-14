import { create } from 'zustand';

import {
  parseCamera,
  roundCamera,
  planBack,
  type HomeSnap,
  type PlanCamera,
  type PlanFrom,
  type PlanMode,
} from '@/lib/plan-flow';
import type { Place } from '@/lib/place-search';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** A place picked for planning: the search result minus its distance (recomputed from my fix when shown). */
export type PlanPlace = Pick<Place, 'id' | 'name' | 'address' | 'lat' | 'lng' | 'category'>;

interface PlanState {
  mode: PlanMode;
  place: PlanPlace | null;
  from: PlanFrom;
  /** The search text that found the place ("search again" from the place bar). */
  query: string;
  sheetSnap: HomeSnap;
  /** Browse camera: persisted (throttled by the map home), restored when Back returns to browse. */
  camera: PlanCamera | null;
  /** The route's numbers, handed to the group form's destination card (set when Ride with a group is tapped). */
  routeSummary: { distanceM: number; durationS: number } | null;
  setRouteSummary: (r: { distanceM: number; durationS: number } | null) => void;
  /** The welcome sheet was already shown and dismissed once. */
  firstRunSeen: boolean;
  /** A new place from a search: the place sheet. */
  openPlace: (place: PlanPlace, query: string) => void;
  /** A recent place or Directions: straight to the route. */
  openRoute: (place: PlanPlace, from: 'search' | 'recent') => void;
  /** One step back; false = nothing to undo, let the OS handle Back. */
  back: () => boolean;
  /** A ride was entered / created / joined: browse again (the camera is kept); the welcome counts as seen. */
  reset: () => void;
  setSheetSnap: (snap: HomeSnap) => void;
  setCamera: (camera: PlanCamera) => void;
  markFirstRunSeen: () => void;
}

const pick = (p: PlanPlace): PlanPlace => ({
  id: p.id,
  name: p.name,
  address: p.address,
  lat: p.lat,
  lng: p.lng,
  category: p.category,
});

/** Memory only, except the camera and the first-run flag (22 §2.1). */
export const usePlanStore = create<PlanState>((set, get) => ({
  mode: 'browse',
  place: null,
  from: null,
  query: '',
  routeSummary: null,
  setRouteSummary: (routeSummary) => set({ routeSummary }),
  sheetSnap: 'peek',
  camera: parseCamera(readItem(STORAGE_KEYS.homeCamera)),
  firstRunSeen: readItem(STORAGE_KEYS.homeFirstRunSeen) === '1',
  openPlace: (place, query) => set({ mode: 'place', place: pick(place), from: 'search', query }),
  openRoute: (place, from) => set((s) => ({ mode: 'route', place: pick(place), from, query: from === 'search' ? s.query : '' })),
  back: () => {
    const s = get();
    const next = planBack(s);
    if (!next) return false;
    set(next.mode === 'browse' ? { mode: 'browse', place: null, from: null, query: '', routeSummary: null, sheetSnap: next.sheetSnap } : { mode: next.mode, sheetSnap: next.sheetSnap });
    return true;
  },
  reset: () => {
    // Every way into a ride comes through here: the first-run welcome has done its job.
    if (!get().firstRunSeen) writeItem(STORAGE_KEYS.homeFirstRunSeen, '1');
    set({ mode: 'browse', place: null, from: null, query: '', routeSummary: null, firstRunSeen: true });
  },
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  setCamera: (camera) => set({ camera }),
  markFirstRunSeen: () => {
    writeItem(STORAGE_KEYS.homeFirstRunSeen, '1');
    set({ firstRunSeen: true });
  },
}));

/** Sign-out: the camera is location history and the welcome belongs to the account (22 §4.2, §9). */
export function clearHomeDevicePrefs(): void {
  writeItem(STORAGE_KEYS.homeCamera, null);
  writeItem(STORAGE_KEYS.homeFirstRunSeen, null);
  usePlanStore.setState({ camera: null, firstRunSeen: false, mode: 'browse', place: null, from: null, query: '', routeSummary: null });
}

/** Writes the browse camera (rounded to about 100 m). Called throttled while panning and on leaving Home. */
export function persistCamera(): void {
  const c = usePlanStore.getState().camera;
  if (c) writeItem(STORAGE_KEYS.homeCamera, JSON.stringify(roundCamera(c)));
}
