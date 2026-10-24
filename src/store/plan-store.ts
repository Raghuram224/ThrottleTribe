import { create } from 'zustand';

import {
  parseCamera,
  roundCamera,
  planBack,
  type HomeSnap,
  type PlanCamera,
  type PlanFrom,
  type PlanMode,
  type SearchContext,
  type SearchStage,
} from '@/lib/plan-flow';
import { clearNavRides } from '@/lib/nav-rides';
import type { Place } from '@/lib/place-search';
import type { SearchChipKey, SearchEntry } from '@/lib/search-entry';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** A place picked for planning: the search result minus its distance (recomputed from my fix when shown). */
export type PlanPlace = Pick<Place, 'id' | 'name' | 'address' | 'lat' | 'lng' | 'category' | 'source'>;

/** What the inline search was last opened with; `nonce` changes on every open so Home seeds its search once per open. */
export interface SearchSeed {
  nonce: number;
  q: string;
  chip: SearchChipKey | null;
  wantsFocus: boolean;
}

interface PlanState {
  mode: PlanMode;
  place: PlanPlace | null;
  from: PlanFrom;
  /** The search text that found the place ("search again" from the place bar). */
  query: string;
  /** In `search`: typing (suggestions list) or the results (pins and the bottom list). */
  searchStage: SearchStage;
  searchSeed: SearchSeed;
  /** Who the inline search is for: Home's places, or the live ride's next stop (28 §8). */
  searchContext: SearchContext;
  sheetSnap: HomeSnap;
  /** Browse camera: persisted (throttled by the map home), restored when Back returns to browse. */
  camera: PlanCamera | null;
  /** The welcome sheet was already shown and dismissed once. */
  firstRunSeen: boolean;
  /** The inline search over Home's map (28): from the bar / Search button, a chip, or "search again". */
  openSearch: (entry?: Partial<SearchEntry>, context?: SearchContext) => void;
  setSearchStage: (stage: SearchStage) => void;
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
  source: p.source,
});

/** Memory only, except the camera and the first-run flag (22 §2.1). */
export const usePlanStore = create<PlanState>((set, get) => ({
  mode: 'browse',
  place: null,
  from: null,
  query: '',
  searchStage: 'typing',
  searchSeed: { nonce: 0, q: '', chip: null, wantsFocus: false },
  searchContext: 'home',
  sheetSnap: 'peek',
  camera: parseCamera(readItem(STORAGE_KEYS.homeCamera)),
  firstRunSeen: readItem(STORAGE_KEYS.homeFirstRunSeen) === '1',
  openSearch: (entry = {}, context = 'home') =>
    set((s) => ({
      mode: 'search',
      searchContext: context,
      place: null,
      from: null,
      query: entry.q ?? '',
      // A chip shows its results at once; the bar and "search again" start typing.
      searchStage: entry.chip ? 'results' : 'typing',
      // The sheet is behind the search: it is back at the strip when search ends.
      sheetSnap: 'peek',
      searchSeed: { nonce: s.searchSeed.nonce + 1, q: entry.q ?? '', chip: entry.chip ?? null, wantsFocus: entry.wantsFocus ?? !entry.chip },
    })),
  setSearchStage: (searchStage) => set({ searchStage }),
  openPlace: (place, query) => set({ mode: 'place', place: pick(place), from: 'search', query }),
  openRoute: (place, from) => set((s) => ({ mode: 'route', place: pick(place), from, query: from === 'search' ? s.query : '' })),
  back: () => {
    const s = get();
    const next = planBack(s);
    if (!next) return false;
    if (next.mode === 'browse') {
      set({ mode: 'browse', place: null, from: null, query: '', searchStage: 'typing', searchContext: 'home', sheetSnap: next.sheetSnap });
    }
    // Back from a place: the results it was picked from, with the query, chip and results kept (Home holds them).
    else if (next.mode === 'search') set({ mode: 'search', place: null, from: null, searchStage: 'results', sheetSnap: next.sheetSnap });
    else set({ mode: next.mode, sheetSnap: next.sheetSnap });
    return true;
  },
  reset: () => {
    // Every way into a ride comes through here: the first-run welcome has done its job.
    if (!get().firstRunSeen) writeItem(STORAGE_KEYS.homeFirstRunSeen, '1');
    set({ mode: 'browse', place: null, from: null, query: '', searchStage: 'typing', searchContext: 'home', firstRunSeen: true });
  },
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  setCamera: (camera) => set({ camera }),
  markFirstRunSeen: () => {
    writeItem(STORAGE_KEYS.homeFirstRunSeen, '1');
    set({ firstRunSeen: true });
  },
}));

/**
 * Sign-out: the camera is location history, the welcome belongs to the account (22 §4.2, §9), and the "I navigate
 * this ride" markers (22 D6) belong to rides of the account that just left.
 */
export function clearHomeDevicePrefs(): void {
  writeItem(STORAGE_KEYS.homeCamera, null);
  writeItem(STORAGE_KEYS.homeFirstRunSeen, null);
  clearNavRides();
  usePlanStore.setState({
    camera: null,
    firstRunSeen: false,
    mode: 'browse',
    place: null,
    from: null,
    query: '',
    searchStage: 'typing',
    searchContext: 'home',
  });
}

/** Writes the browse camera (rounded to about 100 m). Called throttled while panning and on leaving Home. */
export function persistCamera(): void {
  const c = usePlanStore.getState().camera;
  if (c) writeItem(STORAGE_KEYS.homeCamera, JSON.stringify(roundCamera(c)));
}
