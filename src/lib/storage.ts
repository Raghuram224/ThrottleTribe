// Small typed wrapper over the synchronous localStorage that expo-sqlite installs on native.
import 'expo-sqlite/localStorage/install';

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Preferences are a convenience; never crash for them.
  }
}

export const STORAGE_KEYS = {
  themePref: 'pref.theme',
  themeStyle: 'pref.themeStyle',
  rideSketches: 'cache.rideSketches.v1',
  stopThresholdS: 'pref.stopThresholdS',
  pendingJoinCode: 'pending.joinCode',
  mapTilt: 'pref.mapTilt',
  haptics: 'pref.haptics',
  /** Map type (docs/design/25 T2): 'standard' | 'terrain'. A display preference: kept across launches and sign-out. */
  mapLayer: 'pref.mapLayer',
  fullMap: 'pref.fullMap',
  /** Where to? recent places (21 §2.2): on this device only, cleared on sign-out. */
  recentPlaces: 'pref.recentPlaces',
  /** Route preview "Allow expressways" switch (21 decision); default off = avoid. */
  allowExpressways: 'pref.allowExpressways',
  /** Voice directions on / off (21 §4.4): '1' / '0', default on; a device preference, kept across rides and sign-out. */
  navVoice: 'pref.navVoice',
  /** Solo arrival latch (21 §2.8): the ride and destination I already arrived at, so a remount does not re-arrive. */
  navArrival: 'nav.arrival.v1',
  /** Rides whose compensating end failed offline (L2): ended on next start / reconnect. */
  strandedRides: 'nav.strandedRides.v1',
  cachedProfile: 'cache.profile.v1',
  cachedOpenRide: 'cache.openRide.v1',
  cachedRecentRides: 'cache.recentRides.v1',
  /** Map home: the last browse camera (22 §4.2). Location history: device only, cleared on sign-out. */
  homeCamera: 'pref.homeCamera',
  /** Map home: the first-run welcome sheet was dismissed once (22 §3.1.2). Cleared on sign-out. */
  homeFirstRunSeen: 'pref.homeFirstRunSeen',
  /** Rides this phone navigates as the leader: turn-by-turn resumes in them after riders joined (22 D5). */
  navRides: 'nav.navRides.v1',
  /** Rides whose `ride.group_formed` was already sent (22 L6): once per ride across restarts, cleared with the ride's markers. */
  groupFormedSent: 'nav.groupFormed.v1',
  /** The withdrawn "group ride" marker (22 decision 1): only read to be deleted. */
  legacyGroupRides: 'nav.groupRides.v1',
  /** The solo full-map "seen" marker of the removed full-map default (22 L1): only read to be deleted. */
  legacySoloFullMapSeen: 'pref.soloFullMapSeen',
} as const;
