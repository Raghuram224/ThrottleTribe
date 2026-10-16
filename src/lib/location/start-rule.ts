// When the ride layout may start background tracking. Only an active ride needs it: the lobby shares no position
// (and must not pop the Android background-location Settings page before the leader has shared the code), and a
// forgotten lobby must not keep a foreground service running. React-free so the rule is tested.

export interface StartRuleInput {
  loaded: boolean;
  storeRideId: string | null | undefined;
  id: string | undefined;
  status: 'lobby' | 'active' | 'ended' | undefined;
  left: boolean;
  foreground: string | undefined;
  /** A screen of this ride is in front. The permissions explainer (outside the ride) asks before tracking starts. */
  inRide: boolean;
}

export function shouldStartTracking(a: StartRuleInput): boolean {
  if (!a.loaded || !a.id || a.storeRideId !== a.id || a.left || !a.inRide) return false;
  return a.status === 'active' && a.foreground === 'granted';
}
