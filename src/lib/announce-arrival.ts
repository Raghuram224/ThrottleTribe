// The one place an arrival is announced (haptic + telemetry), whichever detector got there first (21 §2.8, L3).
// The engine (nav-session) and the live screen's P1 latch both call it; the store's claim makes the second a no-op,
// so every ride type announces an arrival exactly once.
import { haptic } from '@/lib/haptics';
import { track } from '@/lib/telemetry';
import { useNavStore } from '@/store/nav-store';

export function announceArrival(rideId: string, key: string): void {
  if (!useNavStore.getState().claimArrivalAnnouncement(rideId, key)) return;
  haptic('success');
  track('nav.arrived');
}
