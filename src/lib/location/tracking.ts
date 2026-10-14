import * as Location from 'expo-location';
import { AppState, Platform } from 'react-native';

import { t } from '@/lib/copy';
import { navSession } from '@/lib/nav-session';
import { reportError, track } from '@/lib/telemetry';

import { LOCATION_TASK } from './background-task';
import { needsRestart, taskIntervalMs } from './nav-rate';
import {
  clearRideId,
  getNavRateFlag,
  getRideId,
  getTaskNav,
  getTrackingFlag,
  setNavRateFlag,
  setRideId,
  setTaskNav,
  setTrackingFlag,
} from './ride-config';
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

/**
 * The task's options for a rate. Navigating: fixes every second (Android; iOS ignores `timeInterval`) and the
 * foreground-service notification says directions are on, with no place name (it shows on the lock screen).
 * Accuracy stays High, not BestForNavigation (battery, docs/design/21 §5.5).
 */
function taskOptions(nav: boolean): Location.LocationTaskOptions {
  return {
    accuracy: Location.LocationAccuracy.High,
    timeInterval: taskIntervalMs(nav),
    distanceInterval: 0,
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,
    activityType: Location.LocationActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: nav ? t('nav.fgsTitle') : 'Throttle Tribe — sharing your location with your ride',
      notificationBody: nav ? t('nav.fgsBody') : 'Open the app to see your ride.',
      notificationColor: '#F97316',
      killServiceOnDestroy: false,
    },
  };
}

/**
 * One queue for everything that registers or unregisters the task (start, rate change, stop, recovery), so a stop
 * can never interleave with a re-registration (P3 review H1). Each entry re-checks `gen` once it runs.
 */
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * The ride generation: bumped synchronously by every start and stop. A queued operation that was asked for under an
 * older generation (the ride changed or ended meanwhile) does nothing.
 */
let gen = 0;

const inFront = () => AppState.currentState === 'active';
const trackingWanted = () => getTrackingFlag() && !!getRideId();

/** Android answers a stop of a task that is not registered with "not found": the task is gone, which is the goal. */
function isTaskNotFound(e: unknown): boolean {
  return /not found|TaskNotFound/i.test(e instanceof Error ? e.message : String(e));
}

/** Registers or updates the task (an update when it already exists: expo-task-manager's registerTask sets the options in place). */
async function registerTask(nav: boolean): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, taskOptions(nav));
  setTaskNav(nav);
}

export async function startRideTracking(rideId: string): Promise<StartResult> {
  const myGen = ++gen;
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
  // The ride ended (or another one began) while the permission sheets were up.
  if (myGen !== gen) return { ok: false, reason: 'start-failed', message: 'superseded' };

  setRideId(rideId);
  setTrackingFlag(true);

  try {
    await exclusive(async () => {
      if (myGen !== gen) throw new Error('superseded');
      // Navigation may have asked for the fast rate before tracking finished starting: honour it. A task left
      // registered by a previous ride is updated in place, never stopped first (a stop cannot be undone in the background).
      await registerTask(getNavRateFlag());
    });
  } catch (e) {
    if (myGen === gen) {
      setTrackingFlag(false);
      clearRideId();
    }
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

/**
 * Brings the registered rate to the wished one. Only while the app is in front: Android refuses to (re)start a
 * foreground-service task otherwise (ForegroundServiceStartNotAllowedException), so a change wished for with the
 * screen off waits for the next 'active'. Throws on a failed start; the registered rate is then unchanged.
 */
async function applyNavRate(myGen: number): Promise<void> {
  if (myGen !== gen || !trackingWanted()) return;
  const wanted = getNavRateFlag();
  if (!needsRestart({ tracking: true, registered: getTaskNav(), wanted, android: Platform.OS === 'android' })) return;
  if (!inFront()) return;
  if (!(await isTracking())) return; // the recovery decides what to do with a missing task
  if (myGen !== gen || !trackingWanted()) return; // the ride ended meanwhile: do not bring the task back
  await registerTask(wanted);
}

/** In front during a ride: the task must exist; a lost one (service killed, failed start) is started again. */
async function recover(myGen: number): Promise<void> {
  if (myGen !== gen || !trackingWanted() || !inFront()) return;
  if (!(await isTracking())) {
    if (myGen !== gen || !trackingWanted()) return;
    await registerTask(getNavRateFlag());
    return;
  }
  await applyNavRate(myGen);
}

const surface = (op: string) => (e: unknown) => {
  // Retried on the next 'active': the wish (ride.navRate) and the registered rate (ride.taskNav) still differ.
  reportError(e, { kind: 'background_task', extra: { op } });
};

/**
 * Navigation wants fixes every second (docs/design/21 §4.5.2). Called from the `navActive` edge: `true` re-registers
 * the location task at 1 s (Android), `false` puts it back at 5 s. Uploads keep their cadence (background-task).
 * Never rejects. The wish is remembered if tracking has not started yet or the app is not in front.
 */
export function setNavRate(on: boolean): Promise<void> {
  setNavRateFlag(on);
  const myGen = gen;
  return exclusive(() => applyNavRate(myGen)).catch(surface('nav_rate'));
}

/**
 * Call once from the root layout (UI process). Clears a navigation rate left behind by a dead process (no session
 * runs, so nothing needs 1 s fixes), and on every return to the front checks the task: a missing one is started
 * again, a rate that differs from the wish is applied (a change deferred while backgrounded, or a failed one).
 */
export function startTrackingRecovery(): () => void {
  if (!navSession.getState().active) setNavRateFlag(false);
  const run = () => {
    if (!inFront()) return;
    const myGen = gen;
    void exclusive(() => recover(myGen)).catch(surface('recover'));
  };
  run();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });
  return () => sub.remove();
}

export async function stopRideTracking(): Promise<void> {
  // First, so no voice outlives the ride (every end path comes through here): the session, its speech and its audio.
  navSession.stop({ hard: true });
  // Synchronously, before any await: a queued start or rate change that wakes later sees the ride is over.
  const myGen = ++gen;
  setTrackingFlag(false);
  setNavRateFlag(false);
  await exclusive(async () => {
    try {
      if (await isTracking()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch (e) {
      // Already gone is what we wanted; anything else is reported, and the ride still ends (no ride id: the task
      // uploads nothing).
      if (!isTaskNotFound(e)) reportError(e, { kind: 'background_task', extra: { op: 'stop' } });
    }
    setTaskNav(null);
  });
  // Upload what is left while the ride id is still valid for RLS, then forget the ride (unless a new one began).
  await flush();
  if (myGen === gen) clearRideId();
  track('tracking.stopped');
}

export function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}
