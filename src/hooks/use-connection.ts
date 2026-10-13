import { useNetInfo } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

import type { ChannelStatus } from '@/store/ride-store';
import { timing } from '@/theme/tokens';

export type ConnectionState = 'live' | 'connecting' | 'offline';

/** NetInfo says the phone has no network. `null` (unknown) is treated as online. */
export function useNetOffline(): boolean {
  return useNetInfo().isConnected === false;
}

/**
 * My connection state (00 §2.4). Bad = no network or the ride channel is not subscribed.
 * Bad for less than 5 s reads "connecting" (avoids flicker on reconnect); after that "offline".
 * Recovery is immediate.
 */
export function useConnection(channelStatus: ChannelStatus): ConnectionState {
  const netOffline = useNetOffline();
  const bad = netOffline || channelStatus !== 'subscribed';
  const [confirmedBad, setConfirmedBad] = useState(false);

  useEffect(() => {
    // Always via a timer so state is never set synchronously inside the effect.
    const id = setTimeout(() => setConfirmedBad(bad), bad ? timing.offlineDebounceMs : 0);
    return () => clearTimeout(id);
  }, [bad]);

  if (!bad) return 'live';
  return confirmedBad ? 'offline' : 'connecting';
}
