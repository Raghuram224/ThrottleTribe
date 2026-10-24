import { create } from 'zustand';

import type { RideLayersProps } from '@/components/map/ride-layers';

/** What Home's one map draws and does while the ride view owns it: published by `RideView`, read by `HomeMap`. */
export interface RideScene {
  /** The ride is loaded: until then the map keeps showing the planning scene (nothing is drawn for a ride that is not there). */
  loaded: boolean;
  layers: RideLayersProps;
  handlers: {
    /** The rider's own touch on the map: ends follow / overview. */
    onGesture: () => void;
    /** A tap on the map itself (clears a selected rider). */
    onPress: () => void;
    /** The camera came to rest (the cluster zoom). */
    onIdle: (camera: { center: [number, number]; zoom: number }) => void;
  };
}

interface RideViewState {
  scene: RideScene | null;
  setScene: (scene: RideScene | null) => void;
  /** The ride view is on screen with its overlays (the SOS banner and the ride layout's banners then do not double up). */
  shown: boolean;
  setShown: (shown: boolean) => void;
  /** The rider list is pulled up above its collapsed strip: Back collapses it first (28 §8). */
  stripOpen: boolean;
  setStripOpen: (open: boolean) => void;
  /** Height of the ride's banner stack drawn over the stop search (SOS, approval cards), below the status bar; 0 = none. */
  searchBannerH: number;
  setSearchBannerH: (h: number) => void;
}

/**
 * The bridge between the ride view's overlays (which compute the ride's model and camera) and Home's one map (which draws
 * the ride's layers inside the same MapLibre map as the planning scene). Memory only.
 */
export const useRideViewStore = create<RideViewState>((set) => ({
  scene: null,
  setScene: (scene) => set({ scene }),
  shown: false,
  setShown: (shown) => set({ shown }),
  stripOpen: false,
  setStripOpen: (stripOpen) => set({ stripOpen }),
  searchBannerH: 0,
  setSearchBannerH: (searchBannerH) => set({ searchBannerH }),
}));
