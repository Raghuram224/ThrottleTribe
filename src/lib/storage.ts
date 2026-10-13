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
  cachedProfile: 'cache.profile.v1',
  cachedOpenRide: 'cache.openRide.v1',
  cachedRecentRides: 'cache.recentRides.v1',
} as const;
