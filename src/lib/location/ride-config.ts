// The background task runs headless (no React tree), so its config lives in
// persistent storage instead of component state.
import 'expo-sqlite/localStorage/install';

export const LOCATION_TASK_NAME = 'throttle-tribe-location';

const KEY_RIDE_ID = 'ride.currentRideId';
const KEY_TRACKING = 'ride.tracking';
const KEY_APP_STATE = 'ride.appState';

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
