import { create } from 'zustand';

import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

/** Row highlight lasts this long (06 §4). */
export const SELECT_MS = 5000;

interface LiveUiState {
  selectedUserId: string | null;
  /** Bumps on every select(), so selecting the same rider again re-centres the map and the list. */
  selectNonce: number;
  select: (userId: string) => void;
  clear: () => void;
  /** Full map (19 B): map edge to edge, chrome hidden. Persisted so it survives restarts. */
  fullMap: boolean;
  setFullMap: (on: boolean) => void;
  /** Height (incl. status-bar inset) of the banner stack floating over the full map; 0 when empty. */
  topStackH: number;
  setTopStackH: (h: number) => void;
  /** Bumps to frame me + the next stop once (19 A); Re-centre then resumes follow. */
  focusStopNonce: number;
  focusStop: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Selection shared by the list, the map and the alert banner "View" action (which lives in the ride
 * layout, outside the live screen). Also the full-map state, which the layout and the live screen share.
 */
export const useLiveUiStore = create<LiveUiState>((set, get) => ({
  selectedUserId: null,
  selectNonce: 0,
  select: (userId) => {
    if (timer) clearTimeout(timer);
    set({ selectedUserId: userId, selectNonce: get().selectNonce + 1 });
    timer = setTimeout(() => set({ selectedUserId: null }), SELECT_MS);
  },
  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ selectedUserId: null });
  },
  fullMap: readItem(STORAGE_KEYS.fullMap) === '1',
  setFullMap: (on) => {
    writeItem(STORAGE_KEYS.fullMap, on ? '1' : '0');
    set({ fullMap: on });
  },
  topStackH: 0,
  setTopStackH: (h) => set({ topStackH: h }),
  focusStopNonce: 0,
  focusStop: () => set({ focusStopNonce: get().focusStopNonce + 1 }),
}));
