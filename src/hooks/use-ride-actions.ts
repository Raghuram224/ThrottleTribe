import { createContext, useContext } from 'react';

import type { ConnectionState } from '@/hooks/use-connection';
import type { PermissionInfo } from '@/lib/permissions';

/**
 * What the ride layout (`ride/[id]/_layout.tsx`) offers its lobby / live / summary children.
 * Screens call these instead of re-implementing sheets, RPCs and navigation.
 */
export interface RideActions {
  rideId: string;
  isLeader: boolean;
  /** My connection to the ride (debounced 5 s). */
  connection: ConnectionState;
  /** Latest permission read; null until the first read. */
  permissions: PermissionInfo | null;
  /** Native share sheet with ride name, grouped code and the join link. `via` is the telemetry source ('menu' by default). */
  shareCode: (via?: 'menu' | 'lobby') => void;
  /** Pushes the Invite riders screen (10). */
  openInvite: () => void;
  /** Opens the confirm sheet: leave (riders). Handles SOS clearing, tracking, navigation home. */
  requestLeave: () => void;
  /** Opens the confirm sheet: end the ride (leader). The layout routes everyone to summary. */
  requestEnd: () => void;
  /** The ⋯ ride menu sheet. */
  openMenu: () => void;
  /** Re-asks or opens settings for a missing permission, then re-reads permissions. */
  fixPermission: (target: 'location' | 'background' | 'notifications') => Promise<void>;
}

export const RideActionsContext = createContext<RideActions | null>(null);

export function useRideActions(): RideActions {
  const ctx = useContext(RideActionsContext);
  if (!ctx) throw new Error('useRideActions must be used inside the ride layout');
  return ctx;
}
