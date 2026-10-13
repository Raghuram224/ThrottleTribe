import * as Location from 'expo-location';

import { track } from '@/lib/telemetry';

import { LOCATION_TASK } from './background-task';
import { clearRideId, setRideId, setTrackingFlag } from './ride-config';
import { flush } from './sample-queue';

export interface PermissionState {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
}

export type StartResult =
  | { ok: false; reason: 'foreground-denied' | 'start-failed'; message?: string }
  | { ok: true; backgroundGranted: boolean };

export async function getPermissionState(): Promise<PermissionState> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return { foreground: fg.status, background: bg.status };
}

export async function startRideTracking(rideId: string): Promise<StartResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) {
    track('permission.location', { foreground: false, background: false });
    return { ok: false, reason: 'foreground-denied' };
  }
  // Android 11+ sends the user to settings; on iOS they may stay on "While Using".
  // Keep going either way: foreground tracking still works while the app is open.
  const bg = await Location.requestBackgroundPermissionsAsync();
  track('permission.location', {
    foreground: true,
    background: bg.status === Location.PermissionStatus.GRANTED,
  });

  setRideId(rideId);
  setTrackingFlag(true);

  try {
    // Restart cleanly if a previous ride's task is still registered.
    if (await isTracking()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.LocationAccuracy.High,
      timeInterval: 5000,
      distanceInterval: 0,
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      activityType: Location.LocationActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Throttle Tribe — sharing your location with your ride',
        notificationBody: 'Open the app to see your ride.',
        notificationColor: '#F97316',
        killServiceOnDestroy: false,
      },
    });
  } catch (e) {
    setTrackingFlag(false);
    clearRideId();
    return {
      ok: false,
      reason: 'start-failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }
  const backgroundGranted = bg.status === Location.PermissionStatus.GRANTED;
  track('tracking.started', { background: backgroundGranted });
  return { ok: true, backgroundGranted };
}

export async function stopRideTracking(): Promise<void> {
  if (await isTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  setTrackingFlag(false);
  // Upload what is left while the ride id is still valid for RLS, then forget the ride.
  await flush();
  clearRideId();
  track('tracking.stopped');
}

export function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}
