import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { homeConvoy, type HomeConvoy } from '@/lib/home-convoy';
import { fetchRideSnapshot } from '@/lib/ride-api';

const POLL_MS = 15_000;

export interface HomeConvoyState extends HomeConvoy {
  rideId: string;
  /** Riders still in the ride. */
  riders: number;
}

/**
 * Live convoy for the Home "ride in progress" card (16 §3). Home has no Realtime channel (that lives
 * in the ride screens), so while Home is focused and the ride is active it re-reads the ride snapshot
 * every 15 s. A failed read keeps the last convoy; the card then simply shows what it had.
 */
export function useHomeConvoy(rideId: string | null, active: boolean, myUserId: string | null): HomeConvoyState | null {
  const [state, setState] = useState<HomeConvoyState | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!rideId || !active || !myUserId) return;
      let alive = true;
      const load = async () => {
        try {
          const snap = await fetchRideSnapshot(rideId);
          if (!alive) return;
          const built = homeConvoy(snap, myUserId, Date.now());
          setState({ ...built, rideId, riders: snap.members.filter((m) => !m.left_at).length });
        } catch {
          // Offline: keep the last convoy.
        }
      };
      void load();
      const id = setInterval(() => void load(), POLL_MS);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }, [rideId, active, myUserId]),
  );

  return state && state.rideId === rideId && active ? state : null;
}
