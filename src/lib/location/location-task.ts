import * as Battery from 'expo-battery';
import type { LocationObject } from 'expo-location';
import type { TaskManagerTaskBody } from 'expo-task-manager';
import { Platform } from 'react-native';

import { navSession } from '@/lib/nav-session';
import { sosIsOn } from '@/lib/sos';
import { reportError, track } from '@/lib/telemetry';
import { useSosStore } from '@/store/sos-store';

import { addLatencies, latencyDue, latencySummary, newLatencyWindow, type LatencyWindow } from './fix-latency';
import { shouldEnqueue, throttleUploads } from './nav-rate';
import { getLastAppState, getNavRateFlag, getRideId } from './ride-config';
import { enqueue, flush, recordError, type SampleRow } from './sample-queue';

interface LocationTaskData {
  locations: LocationObject[];
}

type LocationTaskArg = TaskManagerTaskBody<LocationTaskData>;

type AppStateValue = SampleRow['app_state'];

function toAppState(state: string | undefined): AppStateValue {
  return state === 'active' || state === 'background' || state === 'inactive' ? state : 'unknown';
}

/** Some platforms report a negative value for "unknown". */
function nonNegative(value: number | null | undefined): number | null {
  return value == null || value < 0 ? null : value;
}

async function readBattery(): Promise<number | null> {
  try {
    return await Battery.getBatteryLevelAsync();
  } catch {
    return null;
  }
}

/** My SOS is on. If the store cannot be read, assume it is: an unthrottled upload is the safe error. */
function sosOn(): boolean {
  try {
    return sosIsOn(useSosStore.getState().phase);
  } catch {
    return true;
  }
}

/** Timestamp of the last sample queued for upload (only used while the nav rate is on). */
let lastQueuedAt: number | null = null;
let latency: LatencyWindow | null = null;

/** The task body: the heavy part (Supabase, sqlite, battery, nav engine), loaded on the first fix by `background-task.ts`. */
export async function runLocationTask({ data, error, executionInfo }: LocationTaskArg): Promise<void> {
  try {
    if (error) {
      recordError(`Task error: ${error.message}`);
      return;
    }
    const rideId = getRideId();
    if (!rideId || !data?.locations?.length) return;

    // Navigation first (docs/design/21 §4.5.2): every fix goes to the engine, so prompts are on time with the screen
    // off. `ingest` dedupes by timestamp against the foreground watch, and it does nothing at all while no session is
    // running (a headless relaunch has none: no voice, no route request).
    for (const l of data.locations) {
      try {
        navSession.ingest({
          lat: l.coords.latitude,
          lng: l.coords.longitude,
          accuracyM: nonNegative(l.coords.accuracy),
          speedMps: nonNegative(l.coords.speed),
          courseDeg: nonNegative(l.coords.heading),
          t: l.timestamp,
        });
      } catch (e) {
        // A bug in guidance must never cost the group its position uploads.
        reportError(e, { kind: 'background_task', extra: { op: 'nav_ingest' } });
      }
    }

    // §4.5.8 gate measurement: how late do fixes reach the engine (counts and milliseconds only).
    const navRate = getNavRateFlag();
    if (navRate) {
      const now = Date.now();
      latency = addLatencies(latency ?? newLatencyWindow(now), data.locations.map((l) => l.timestamp), now);
      if (latencyDue(latency, now)) {
        track('nav.fix_latency', { ...latencySummary(latency), app_state: toAppState(executionInfo?.appState ?? getLastAppState() ?? undefined) });
        latency = newLatencyWindow(now);
      }
    }

    // Uploads keep their cadence on Android, where the task runs at 1 s: only samples 4.5 s apart are queued. Not
    // on iOS (its rate never changed), and not while an SOS is on (an emergency position must not wait).
    const throttled = throttleUploads({
      navRate,
      android: Platform.OS === 'android',
      sosOn: sosOn(),
    });
    const upload = data.locations.filter((l) => {
      if (throttled && !shouldEnqueue(true, lastQueuedAt, l.timestamp)) return false;
      lastQueuedAt = l.timestamp;
      return true;
    });
    if (upload.length === 0) return;

    const appState = toAppState(executionInfo?.appState ?? getLastAppState() ?? undefined);
    const battery = await readBattery();
    const rows: SampleRow[] = upload.map((l) => ({
      ride_id: rideId,
      recorded_at: new Date(l.timestamp).toISOString(),
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracy_m: l.coords.accuracy,
      speed_mps: nonNegative(l.coords.speed),
      heading: nonNegative(l.coords.heading),
      app_state: appState,
      battery,
    }));
    enqueue(rows);
    await flush();
  } catch (e) {
    reportError(e, { kind: 'background_task' });
    recordError(e instanceof Error ? e.message : String(e));
  }
}
