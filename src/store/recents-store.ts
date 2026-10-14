import { create } from 'zustand';

import { addRecent, parseRecents, type RecentPlace } from '@/lib/recent-places';
import { readItem, STORAGE_KEYS, writeItem } from '@/lib/storage';

interface RecentsState {
  recents: RecentPlace[];
  /** Called when navigation starts to a place (Go, or in-ride Go here); not when it is only previewed. */
  add: (place: Omit<RecentPlace, 'usedAt'>) => void;
  clear: () => void;
}

/** Recent places live on this phone only (21 §5.6) and are cleared on sign-out. */
export const useRecentsStore = create<RecentsState>((set, get) => ({
  recents: parseRecents(readItem(STORAGE_KEYS.recentPlaces)),
  add: (place) => {
    const recents = addRecent(get().recents, place, Date.now());
    writeItem(STORAGE_KEYS.recentPlaces, JSON.stringify(recents));
    set({ recents });
  },
  clear: () => {
    writeItem(STORAGE_KEYS.recentPlaces, null);
    set({ recents: [] });
  },
}));
