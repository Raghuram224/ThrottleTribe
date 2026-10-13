import { create } from 'zustand';

import type { NudgeKind } from '@/lib/home';

interface NudgeState {
  /** "Later" on a Home nudge hides it until the next ride ends. In memory on purpose: a restart
   *  showing it once more is a gentle reminder, not a bug. */
  dismissed: Partial<Record<NudgeKind, boolean>>;
  /** Rides whose lobby contacts banner was closed (per ride, 11 §4). */
  lobbyDismissed: Record<string, true>;
  dismiss: (kind: NudgeKind) => void;
  dismissLobby: (rideId: string) => void;
  /** Called when a ride ends: the Home nudges may come back. */
  reset: () => void;
}

export const useNudgeStore = create<NudgeState>((set) => ({
  dismissed: {},
  lobbyDismissed: {},
  dismiss: (kind) => set((s) => ({ dismissed: { ...s.dismissed, [kind]: true } })),
  dismissLobby: (rideId) => set((s) => ({ lobbyDismissed: { ...s.lobbyDismissed, [rideId]: true } })),
  reset: () => set({ dismissed: {} }),
}));
