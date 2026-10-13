// Pure navigation decisions (docs/design/00-overview.md §1 and 04). No React, no router, no native
// modules, so they are unit-tested; screens and layouts only apply the result.

export type RideStatusName = 'lobby' | 'active' | 'ended';
/** Children a ride status maps to. `invite` is valid in lobby and active (10 §1), `search` only while active (19 A). */
export type RideTarget = 'lobby' | 'live' | 'summary';
export type RideChild = RideTarget | 'invite' | 'search';

/** `/ride/<id>/<child>` for a ride in the given status. */
export function rideHref(id: string, status: RideStatusName): string {
  const child: RideTarget = status === 'lobby' ? 'lobby' : status === 'active' ? 'live' : 'summary';
  return `/ride/${id}/${child}`;
}

export interface GateInput {
  /** A session is STORED on the device (it need not be fresh: a failed refresh does not clear it). */
  hasSession: boolean;
  /** The server definitively refused the refresh token (revoked / invalid): signed out for real. */
  authRejected?: boolean;
  /** No network, or the requests failed retryably: `profile`/`openRide` are then unknown. */
  offline?: boolean;
  /** 'error' = the request failed (offline). */
  profile: 'yes' | 'no' | 'error';
  openRide: { id: string; status: RideStatusName } | null | 'error';
  /** Last-known data from local storage, used when the answers above are stale. */
  cachedProfile?: boolean;
  cachedOpenRide?: { id: string; status: RideStatusName } | null;
}

/**
 * First screen after launch. Only a definitive auth failure, or no stored session (and no cached
 * profile to fall back on while offline), reaches onboarding. When the network cannot answer, the
 * cached open ride wins (lobby or live per status), else home, which shows its own offline state.
 */
export function decideGate(input: GateInput): string {
  if (input.authRejected) return '/welcome';
  const stale = !!input.offline || input.profile === 'error' || input.openRide === 'error';
  const cachedRide = input.cachedOpenRide ?? null;
  const fromCache = () => (cachedRide ? rideHref(cachedRide.id, cachedRide.status) : '/home');

  if (!input.hasSession) {
    // Stored session gone but the rider was known and we cannot reach the server: keep them in.
    return input.offline && input.cachedProfile ? fromCache() : '/welcome';
  }
  if (stale) return fromCache();
  if (input.profile === 'no') return '/welcome';
  if (input.openRide === null || input.openRide === 'error') return '/home';
  return rideHref(input.openRide.id, input.openRide.status);
}

/**
 * The gate's instant decision from LOCAL state only (stored session + cached profile/open ride).
 * Synchronous on purpose: supabase-js getSession() retries a refresh for ~25 s without network.
 */
export function decideGateLocal(input: {
  hasSession: boolean;
  authRejected?: boolean;
  cachedProfile?: boolean;
  cachedOpenRide?: { id: string; status: RideStatusName } | null;
}): string {
  return decideGate({
    hasSession: input.hasSession,
    authRejected: input.authRejected,
    // Treated as offline: "no stored session but a cached profile" stays in only when offline.
    offline: true,
    profile: 'error',
    openRide: 'error',
    cachedProfile: input.cachedProfile,
    cachedOpenRide: input.cachedOpenRide,
  });
}

export type JoinLinkDecision = 'join' | 'open-same' | 'confirm-switch' | 'leader-busy';

/**
 * What a join code (typed, or from a throttletribe://join deep link) does when I may already be in
 * a ride: nothing open -> join; the same ride -> just open it; another ride -> ask before leaving
 * it (a leader must end it first).
 */
export function joinLinkDecision(
  open: { code: string; role: 'leader' | 'rider' | string } | null,
  code: string,
): JoinLinkDecision {
  if (!open) return 'join';
  if (open.code === code) return 'open-same';
  return open.role === 'leader' ? 'leader-busy' : 'confirm-switch';
}

export interface RideRedirectInput {
  status: RideStatusName;
  /** The ride child currently shown; null if none matched. */
  child: RideChild | null;
  /** My member row has `left_at`. */
  left: boolean;
}

export interface RideRedirect {
  to: RideTarget | 'home';
  stopTracking: boolean;
  /** Success haptic: the ride just started for me. */
  successHaptic: boolean;
}

/** The ride layout's redirect table. Returns null when the current child is already right. */
export function rideRedirect({ status, child, left }: RideRedirectInput): RideRedirect | null {
  if (left) return { to: 'home', stopTracking: true, successHaptic: false };
  if (status === 'ended') {
    return child === 'summary' ? null : { to: 'summary', stopTracking: true, successHaptic: false };
  }
  // Invite stays open in lobby and active (10 §1); only `ended` (above) or leaving moves it.
  if (child === 'invite') return null;
  // Stop search only makes sense on a live ride: from the lobby it falls back to the lobby.
  if (child === 'search' && status === 'active') return null;
  if (status === 'active') {
    return child === 'live' ? null : { to: 'live', stopTracking: false, successHaptic: child === 'lobby' };
  }
  // lobby
  return child === 'lobby' ? null : { to: 'lobby', stopTracking: false, successHaptic: false };
}

// ---------------------------------------------------------------- permission steps (04)

export type PermissionValue = 'granted' | 'denied' | 'undetermined';
export type PermissionStep = 'loc' | 'bg' | 'notif';

export interface PermissionSnapshot {
  foreground: PermissionValue;
  background: PermissionValue;
  notifications: PermissionValue;
  /** From the OS; missing = unknown, treated as askable. */
  foregroundCanAskAgain?: boolean;
  backgroundCanAskAgain?: boolean;
  notificationsCanAskAgain?: boolean;
}

/**
 * Askable = not granted and the OS will still show its dialog. Android 13+ reports 'denied'
 * (canAskAgain true) before the user was ever asked, so 'denied' alone is not a refusal.
 */
function askable(status: PermissionValue, canAskAgain: boolean | undefined): boolean {
  return status !== 'granted' && canAskAgain !== false;
}

/**
 * Which explainer steps still need showing. Anything granted or permanently refused is skipped
 * (never nag twice); background cannot be asked unless foreground is granted or still askable.
 */
export function permissionSteps(s: PermissionSnapshot): PermissionStep[] {
  const steps: PermissionStep[] = [];
  const fgAsk = askable(s.foreground, s.foregroundCanAskAgain);
  if (fgAsk) steps.push('loc');
  if (askable(s.background, s.backgroundCanAskAgain) && (s.foreground === 'granted' || fgAsk)) {
    steps.push('bg');
  }
  if (askable(s.notifications, s.notificationsCanAskAgain)) steps.push('notif');
  return steps;
}

/** Next step after `current`, given what the user just did. Null = go to the ride. */
export function nextPermissionStep(
  steps: PermissionStep[],
  current: PermissionStep,
  foregroundGranted: boolean,
): PermissionStep | null {
  const rest = steps.slice(steps.indexOf(current) + 1);
  // Without foreground there is nothing to keep sharing in the background.
  return rest.find((s) => s !== 'bg' || foregroundGranted) ?? null;
}
