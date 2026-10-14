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
  fullMap: 'pref.fullMap',
  /** Last ride whose first open (solo full-map default) was handled. */
  soloFullMapSeen: 'pref.soloFullMapSeen',
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
} as const;
