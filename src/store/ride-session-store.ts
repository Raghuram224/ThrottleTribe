import { create } from 'zustand';

import type { RideSession } from '@/components/ride/use-ride-session';

interface RideSessionState {
  /** What the one session (owned by `RideHost`) currently offers; null while no ride is open. */
  session: RideSession | null;
  setSession: (session: RideSession | null) => void;
}

/**
 * The bridge from the host (a sibling of the (app) stack) to the ride layout inside it: the layout cannot
 * read the host's hook result through context, and must not run a second session of its own.
 */
export const useRideSessionStore = create<RideSessionState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
