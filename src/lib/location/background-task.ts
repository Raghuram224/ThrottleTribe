import * as Battery from 'expo-battery';
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { reportError } from '@/lib/telemetry';

import { getLastAppState, getRideId, LOCATION_TASK_NAME } from './ride-config';
import { enqueue, flush, recordError, type SampleRow } from './sample-queue';

export const LOCATION_TASK = LOCATION_TASK_NAME;

interface LocationTaskData {
  locations: LocationObject[];
}

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

// Must be called in global scope: on a headless background launch no React tree mounts.
TaskManager.defineTask<LocationTaskData>(LOCATION_TASK, async ({ data, error, executionInfo }) => {
  try {
    if (error) {
      recordError(`Task error: ${error.message}`);
      return;
    }
    const rideId = getRideId();
    if (!rideId || !data?.locations?.length) return;

    const appState = toAppState(executionInfo?.appState ?? getLastAppState() ?? undefined);
    const battery = await readBattery();
    const rows: SampleRow[] = data.locations.map((l) => ({
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
});
