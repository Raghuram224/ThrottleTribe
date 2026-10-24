import {
  decideGate,
  decideGateLocal,
  joinLinkDecision,
  liveRideId,
  nextPermissionStep,
  permissionSteps,
  rideHref,
  rideRedirect,
  rideChildFor,
  rideIdFromPath,
  rideOnHome,
  sessionRideId,
  type PermissionSnapshot,
} from '../routing';

describe('rideHref', () => {
  it('maps status to child', () => {
    expect(rideHref('r1', 'lobby')).toBe('/ride/r1/lobby');
    expect(rideHref('r1', 'active')).toBe('/ride/r1/live');
    expect(rideHref('r1', 'ended')).toBe('/ride/r1/summary');
  });
});

describe('decideGate', () => {
  const ride = { id: 'r1', status: 'active' as const };
  it('no session or no profile goes to onboarding', () => {
    expect(decideGate({ hasSession: false, profile: 'yes', openRide: null })).toBe('/welcome');
    expect(decideGate({ hasSession: true, profile: 'no', openRide: ride })).toBe('/welcome');
  });
  it('open ride goes straight into it, by status', () => {
    expect(decideGate({ hasSession: true, profile: 'yes', openRide: ride })).toBe('/ride/r1/live');
    expect(decideGate({ hasSession: true, profile: 'yes', openRide: { id: 'r2', status: 'lobby' } })).toBe(
      '/ride/r2/lobby',
    );
  });
  it('no ride goes home', () => {
    expect(decideGate({ hasSession: true, profile: 'yes', openRide: null })).toBe('/home');
  });
  it('network failures with a cached session go home', () => {
    expect(decideGate({ hasSession: true, profile: 'error', openRide: 'error' })).toBe('/home');
    expect(decideGate({ hasSession: true, profile: 'yes', openRide: 'error' })).toBe('/home');
  });
});

describe('decideGate offline matrix', () => {
  const lobby = { id: 'r9', status: 'lobby' as const };
  const active = { id: 'r8', status: 'active' as const };
  const offlineBase = { hasSession: true, offline: true, profile: 'error', openRide: 'error' } as const;

  it('no stored session and nothing cached goes to onboarding (online or not)', () => {
    expect(decideGate({ hasSession: false, profile: 'error', openRide: 'error' })).toBe('/welcome');
    expect(decideGate({ hasSession: false, offline: true, profile: 'error', openRide: 'error' })).toBe('/welcome');
  });
  it('no stored session online goes to onboarding even with a cached profile', () => {
    expect(decideGate({ hasSession: false, profile: 'no', openRide: null, cachedProfile: true })).toBe('/welcome');
  });
  it('stored session online behaves as before', () => {
    expect(decideGate({ hasSession: true, offline: false, profile: 'yes', openRide: active })).toBe('/ride/r8/live');
    expect(decideGate({ hasSession: true, offline: false, profile: 'yes', openRide: null })).toBe('/home');
    expect(decideGate({ hasSession: true, offline: false, profile: 'no', openRide: null })).toBe('/welcome');
  });
  it('stored session offline enters the cached ride by status', () => {
    expect(decideGate({ ...offlineBase, cachedOpenRide: lobby })).toBe('/ride/r9/lobby');
    expect(decideGate({ ...offlineBase, cachedOpenRide: active })).toBe('/ride/r8/live');
  });
  it('stored session offline with no cached ride goes home, even with no cached profile', () => {
    expect(decideGate({ ...offlineBase, cachedOpenRide: null })).toBe('/home');
    expect(decideGate({ ...offlineBase, cachedProfile: true })).toBe('/home');
  });
  it('profile fetched but ride fetch failed uses the cache', () => {
    expect(decideGate({ hasSession: true, profile: 'yes', openRide: 'error', cachedOpenRide: active })).toBe(
      '/ride/r8/live',
    );
  });
  it('a definitive auth failure always goes to onboarding', () => {
    expect(
      decideGate({ ...offlineBase, hasSession: false, authRejected: true, cachedProfile: true, cachedOpenRide: active }),
    ).toBe('/welcome');
    expect(decideGate({ ...offlineBase, authRejected: true, cachedOpenRide: active })).toBe('/welcome');
  });
});

describe('rideRedirect', () => {
  it('lobby: live/summary go back to lobby', () => {
    expect(rideRedirect({ status: 'lobby', child: 'live', left: false })?.to).toBe('lobby');
    expect(rideRedirect({ status: 'lobby', child: 'summary', left: false })?.to).toBe('lobby');
    expect(rideRedirect({ status: 'lobby', child: 'lobby', left: false })).toBeNull();
  });
  it('active: lobby goes to live with a success haptic', () => {
    expect(rideRedirect({ status: 'active', child: 'lobby', left: false })).toEqual({
      to: 'live',
      stopTracking: false,
      successHaptic: true,
    });
    expect(rideRedirect({ status: 'active', child: 'live', left: false })).toBeNull();
  });
  it('ended: stops tracking and goes to summary once', () => {
    expect(rideRedirect({ status: 'ended', child: 'live', left: false })).toEqual({
      to: 'summary',
      stopTracking: true,
      successHaptic: false,
    });
    expect(rideRedirect({ status: 'ended', child: 'summary', left: false })).toBeNull();
  });
  it('search is valid only while active (19 A)', () => {
    expect(rideRedirect({ status: 'active', child: 'search', left: false })).toBeNull();
    expect(rideRedirect({ status: 'lobby', child: 'search', left: false })?.to).toBe('lobby');
    expect(rideRedirect({ status: 'ended', child: 'search', left: false })?.to).toBe('summary');
    expect(rideRedirect({ status: 'active', child: 'search', left: true })?.to).toBe('home');
  });

  it('invite stays put in lobby and active, but ended sends it to summary (10 §1)', () => {
    expect(rideRedirect({ status: 'lobby', child: 'invite', left: false })).toBeNull();
    expect(rideRedirect({ status: 'active', child: 'invite', left: false })).toBeNull();
    expect(rideRedirect({ status: 'ended', child: 'invite', left: false })?.to).toBe('summary');
    expect(rideRedirect({ status: 'lobby', child: 'invite', left: true })?.to).toBe('home');
  });
  it('left beats everything', () => {
    expect(rideRedirect({ status: 'active', child: 'live', left: true })).toEqual({
      to: 'home',
      stopTracking: true,
      successHaptic: false,
    });
  });
});

describe('permission steps', () => {
  const snap = (p: Partial<PermissionSnapshot>): PermissionSnapshot => ({
    foreground: 'undetermined',
    background: 'undetermined',
    notifications: 'undetermined',
    ...p,
  });

  it('shows all three on a fresh install', () => {
    expect(permissionSteps(snap({}))).toEqual(['loc', 'bg', 'notif']);
  });
  it('skips what is answered, never nags denied', () => {
    expect(permissionSteps(snap({ foreground: 'granted' }))).toEqual(['bg', 'notif']);
    expect(
      permissionSteps(
        snap({
          foreground: 'denied',
          background: 'denied',
          foregroundCanAskAgain: false,
          backgroundCanAskAgain: false,
        }),
      ),
    ).toEqual(['notif']);
    expect(
      permissionSteps({ foreground: 'granted', background: 'granted', notifications: 'granted' }),
    ).toEqual([]);
  });
  it('background is not asked after foreground is denied', () => {
    expect(
      permissionSteps(snap({ foreground: 'denied', foregroundCanAskAgain: false })),
    ).toEqual(['notif']);
  });
  it('Android 13+: "denied" with canAskAgain is still askable', () => {
    const fresh = snap({
      foreground: 'denied',
      background: 'denied',
      notifications: 'denied',
      foregroundCanAskAgain: true,
      backgroundCanAskAgain: true,
      notificationsCanAskAgain: true,
    });
    expect(permissionSteps(fresh)).toEqual(['loc', 'bg', 'notif']);
    expect(
      permissionSteps({ ...fresh, notificationsCanAskAgain: false }),
    ).toEqual(['loc', 'bg']);
    expect(
      permissionSteps({ ...fresh, foreground: 'granted', backgroundCanAskAgain: false }),
    ).toEqual(['notif']);
  });
  it('next step skips bg when foreground was not granted', () => {
    const steps = permissionSteps(snap({}));
    expect(nextPermissionStep(steps, 'loc', true)).toBe('bg');
    expect(nextPermissionStep(steps, 'loc', false)).toBe('notif');
    expect(nextPermissionStep(steps, 'notif', true)).toBeNull();
  });
});

describe('decideGateLocal (synchronous, local state only)', () => {
  const ride = { id: 'r1', status: 'lobby' as const };
  it('returns a string at once, no promise', () => {
    expect(typeof decideGateLocal({ hasSession: true, cachedProfile: true })).toBe('string');
  });
  it('stored session without a cache goes home; with a cached ride goes into it', () => {
    expect(decideGateLocal({ hasSession: true })).toBe('/home');
    expect(decideGateLocal({ hasSession: true, cachedProfile: true, cachedOpenRide: ride })).toBe('/ride/r1/lobby');
  });
  it('no session or a rejected token goes to onboarding', () => {
    expect(decideGateLocal({ hasSession: false })).toBe('/welcome');
    expect(decideGateLocal({ hasSession: true, authRejected: true, cachedProfile: true })).toBe('/welcome');
  });
});

describe('joinLinkDecision (deep link while in a ride)', () => {
  it('joins when no ride is open, opens the same ride, otherwise asks first', () => {
    expect(joinLinkDecision(null, '111222')).toBe('join');
    expect(joinLinkDecision({ code: '111222', role: 'rider' }, '111222')).toBe('open-same');
    expect(joinLinkDecision({ code: '999999', role: 'rider' }, '111222')).toBe('confirm-switch');
  });
  it('a leader must end their ride first', () => {
    expect(joinLinkDecision({ code: '999999', role: 'leader' }, '111222')).toBe('leader-busy');
  });
});

describe('rideChildFor', () => {
  it('reads the child from a ride pathname', () => {
    expect(rideChildFor('/ride/r1/lobby', null)).toBe('lobby');
    expect(rideChildFor('/ride/r1/live', null)).toBe('live');
    expect(rideChildFor('/ride/r1/invite', null)).toBe('invite');
    expect(rideChildFor('/ride/r1/search', null)).toBe('search');
    expect(rideChildFor('/ride/r1/summary/', null)).toBe('summary');
  });
  it('is null outside the ride screens', () => {
    expect(rideChildFor('/home', null)).toBeNull();
    expect(rideChildFor('/join', null)).toBeNull();
    expect(rideChildFor('/ride/r1', null)).toBeNull();
    expect(rideChildFor('/ride/r1/other', null)).toBeNull();
    expect(rideChildFor('/emergency-contacts', 'r1')).toBeNull();
  });
  it('counts Home as the live child while a ride view is open there', () => {
    expect(rideChildFor('/home', 'r1')).toBe('live');
    expect(rideChildFor('/ride/r1/lobby', 'r1')).toBe('lobby');
  });
});

describe('rideIdFromPath', () => {
  it('extracts the id of a ride screen', () => {
    expect(rideIdFromPath('/ride/abc-1/live')).toBe('abc-1');
    expect(rideIdFromPath('/home')).toBeNull();
  });
});

describe('sessionRideId', () => {
  const base = { pathname: '/home', viewRideId: null, storeRideId: 'r1', status: 'active' as const, left: false };
  it('follows the ride screen shown, whatever the store says', () => {
    expect(sessionRideId({ ...base, pathname: '/ride/r2/lobby', status: 'ended' })).toBe('r2');
    expect(sessionRideId({ ...base, pathname: '/ride/r1/summary', status: 'ended' })).toBe('r1');
    expect(sessionRideId({ ...base, pathname: '/ride/r2/live', storeRideId: null, status: undefined })).toBe('r2');
  });
  it('stays on the stored lobby or active ride after Back to Home', () => {
    expect(sessionRideId(base)).toBe('r1');
    expect(sessionRideId({ ...base, status: 'lobby' })).toBe('r1');
    expect(sessionRideId({ ...base, pathname: '/join' })).toBe('r1');
  });
  it('releases an ended ride, a ride I left, and an unknown one', () => {
    expect(sessionRideId({ ...base, status: 'ended' })).toBeNull();
    expect(sessionRideId({ ...base, left: true })).toBeNull();
    expect(sessionRideId({ ...base, status: undefined })).toBeNull();
    expect(sessionRideId({ ...base, storeRideId: null })).toBeNull();
  });
  it('uses the ride view open on Home', () => {
    expect(sessionRideId({ ...base, viewRideId: 'r3', storeRideId: null, status: undefined })).toBe('r3');
  });
});

describe('liveRideId', () => {
  it('reads the ride of a live screen target, query ignored', () => {
    expect(liveRideId('/ride/r1/live')).toBe('r1');
    expect(liveRideId('/ride/r1/live?x=1')).toBe('r1');
    expect(liveRideId('/ride/a%2Db/live')).toBe('a-b');
  });
  it('is null for every other target (the lobby, the invite, the explainer)', () => {
    expect(liveRideId('/ride/r1/lobby')).toBeNull();
    expect(liveRideId('/ride/r1/invite?first=1')).toBeNull();
    expect(liveRideId('/permissions?rideId=r1&next=live')).toBeNull();
    expect(liveRideId('/home')).toBeNull();
  });
});

describe('rideOnHome (28 §8)', () => {
  it('needs the flag, and never runs on web', () => {
    expect(rideOnHome(true, 'android')).toBe(true);
    expect(rideOnHome(true, 'ios')).toBe(true);
    expect(rideOnHome(true, 'web')).toBe(false);
    expect(rideOnHome(false, 'android')).toBe(false);
  });
});

describe('the ride view and the redirect table (28 §8)', () => {
  it('Home with a ride view is the live child: an active ride is already right', () => {
    const child = rideChildFor('/home', 'r1');
    expect(rideRedirect({ status: 'active', child, left: false })).toBeNull();
  });
  it('a lobby ride asked for on Home goes to the lobby, an ended one to the summary, one I left to Home', () => {
    const child = rideChildFor('/home', 'r1');
    expect(rideRedirect({ status: 'lobby', child, left: false })?.to).toBe('lobby');
    expect(rideRedirect({ status: 'ended', child, left: false })?.to).toBe('summary');
    expect(rideRedirect({ status: 'active', child, left: true })?.to).toBe('home');
  });
  it('the session stays on the ride while its summary is in front (it keeps its data), then follows the store', () => {
    expect(sessionRideId({ pathname: '/ride/r1/summary', viewRideId: 'r1', storeRideId: 'r1', status: 'ended', left: false })).toBe('r1');
    expect(sessionRideId({ pathname: '/home', viewRideId: null, storeRideId: 'r1', status: 'ended', left: false })).toBeNull();
  });
});
