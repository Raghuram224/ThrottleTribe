// Web tracking: foreground only. navigator.geolocation.watchPosition feeds the same sample queue
// and upload path as the native background task. When the page is hidden, iOS Safari stops
// delivering positions: the web UI says so (WebRideNotices) and the watch restarts on return.
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';

import { navSession } from '@/lib/nav-session';
import { track } from '@/lib/telemetry';
import { positionToRow, sampleDue } from '@/lib/web/web-utils';

import { clearRideId, getRideId, setRideId, setTrackingFlag } from './ride-config';
import { enqueue, flush, recordError, type SampleRow } from './sample-queue';

export interface PermissionState {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
}

export type StartResult =
  | { ok: false; reason: 'foreground-denied' | 'start-failed'; message?: string }
  | { ok: true; backgroundGranted: boolean };

let watchId: number | null = null;
let activeRide: string | null = null;
let lastSampleAt = 0;
let listening = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export async function getPermissionState(): Promise<PermissionState> {
  const fg = await Location.getForegroundPermissionsAsync();
  return { foreground: fg.status, background: Location.PermissionStatus.UNDETERMINED };
}

function appState(): SampleRow['app_state'] {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 'background' : 'active';
}

async function readBattery(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? level : null;
  } catch {
    return null;
  }
}

function onPosition(pos: GeolocationPosition): void {
  const rideId = getRideId();
  // The ride ended or I left (stopTrackingForRide cleared the id): stop the watch for good.
  if (!rideId || rideId !== activeRide) {
    void stopWatching();
    return;
  }
  const now = Date.now();
  if (!sampleDue(lastSampleAt, now)) return;
  lastSampleAt = now;
  void (async () => {
    try {
      const battery = await readBattery();
      enqueue([positionToRow(rideId, pos, appState(), battery)]);
      await flush();
    } catch (e) {
      recordError(e instanceof Error ? e.message : String(e));
    }
  })();
}

function onError(err: GeolocationPositionError): void {
  recordError(`Location error: ${err.message}`);
}

function beginWatch(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 30_000,
  });
}

// iOS may silently drop the watch while the page is hidden: restart it and upload the backlog.
function onVisibility(): void {
  if (document.visibilityState !== 'visible' || activeRide === null) return;
  beginWatch();
  void flush();
}

async function stopWatching(): Promise<void> {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  activeRide = null;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  if (listening) {
    document.removeEventListener('visibilitychange', onVisibility);
    listening = false;
  }
}

export async function startRideTracking(rideId: string): Promise<StartResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: 'start-failed', message: 'This browser cannot share location.' };
  }
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) {
    track('permission.location', { foreground: false, background: false });
    return { ok: false, reason: 'foreground-denied' };
  }
  track('permission.location', { foreground: true, background: false });

  setRideId(rideId);
  setTrackingFlag(true);
  activeRide = rideId;
  lastSampleAt = 0;
  try {
    beginWatch();
  } catch (e) {
    setTrackingFlag(false);
    clearRideId();
    activeRide = null;
    return { ok: false, reason: 'start-failed', message: e instanceof Error ? e.message : String(e) };
  }
  if (!listening) {
    document.addEventListener('visibilitychange', onVisibility);
    listening = true;
  }
  // Retry uploads that failed while offline even when no new position arrives.
  if (!flushTimer) flushTimer = setInterval(() => void flush(), 15_000);
  track('tracking.started', { background: false });
  return { ok: true, backgroundGranted: false };
}

/** No background task on web: nothing to re-register. */
export async function setNavRate(_on: boolean): Promise<void> {}

export async function stopRideTracking(): Promise<void> {
  // First, so no voice outlives the ride (every end path comes through here).
  navSession.stop({ hard: true });
  await stopWatching();
  setTrackingFlag(false);
  // Upload what is left while the ride id is still valid for RLS, then forget the ride.
  await flush();
  clearRideId();
  track('tracking.stopped');
}

export async function isTracking(): Promise<boolean> {
  return watchId !== null;
}

/** No native task on the web: nothing to recover. */
export function startTrackingRecovery(): () => void {
  return () => {};
}
