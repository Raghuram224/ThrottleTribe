// The background task runs headless (no React tree), so its config lives in
// persistent storage instead of component state.
import 'expo-sqlite/localStorage/install';

export const LOCATION_TASK_NAME = 'throttle-tribe-location';

const KEY_RIDE_ID = 'ride.currentRideId';
const KEY_TRACKING = 'ride.tracking';
const KEY_APP_STATE = 'ride.appState';
const KEY_NAV_RATE = 'ride.navRate';
const KEY_TASK_NAV = 'ride.taskNav';

export type StoredAppState = 'active' | 'background' | 'inactive';

export function getLastAppState(): StoredAppState | null {
  const value = localStorage.getItem(KEY_APP_STATE);
  return value === 'active' || value === 'background' || value === 'inactive' ? value : null;
}

export function setLastAppState(state: string): void {
  if (state === 'active' || state === 'background' || state === 'inactive') {
    localStorage.setItem(KEY_APP_STATE, state);
  }
}

/** The ride whose samples the background task uploads; null when not tracking. */
export function getRideId(): string | null {
  return localStorage.getItem(KEY_RIDE_ID);
}

export function setRideId(rideId: string): void {
  localStorage.setItem(KEY_RIDE_ID, rideId);
}

export function clearRideId(): void {
  localStorage.removeItem(KEY_RIDE_ID);
}

export function getTrackingFlag(): boolean {
  return localStorage.getItem(KEY_TRACKING) === '1';
}

export function setTrackingFlag(on: boolean): void {
  localStorage.setItem(KEY_TRACKING, on ? '1' : '0');
}

/**
 * Navigation wants fixes at 1 s (docs/design/21 §4.5.2). Persisted because the task reads it headless and a
 * tracking start must honour a rate that was asked for before it finished.
 */
export function getNavRateFlag(): boolean {
  return localStorage.getItem(KEY_NAV_RATE) === '1';
}

export function setNavRateFlag(on: boolean): void {
  localStorage.setItem(KEY_NAV_RATE, on ? '1' : '0');
}

/**
 * The rate the OS-registered location task was last started with: '1' fast, '0' normal, missing = unknown. Persisted
 * (not a module variable) so a new JS process does not re-register a task that already has the right rate.
 */
export function getTaskNav(): boolean | null {
  const value = localStorage.getItem(KEY_TASK_NAV);
  return value === '1' ? true : value === '0' ? false : null;
}

export function setTaskNav(nav: boolean | null): void {
  if (nav === null) localStorage.removeItem(KEY_TASK_NAV);
  else localStorage.setItem(KEY_TASK_NAV, nav ? '1' : '0');
}
