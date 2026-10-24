import * as TaskManager from 'expo-task-manager';

import { LOCATION_TASK_NAME } from './task-name';

export const LOCATION_TASK = LOCATION_TASK_NAME;

// Must be called in global scope: on a headless background launch no React tree mounts. Only expo-task-manager is
// loaded here: this runs at bundle load (the root `index.js`), possibly in a runtime that is still starting, and the
// heavy graph (Supabase, sqlite, battery, location, nav engine) touches native modules the moment it is evaluated.
// It is loaded on the first fix instead, when the runtime is certainly up.
TaskManager.defineTask(LOCATION_TASK, (body) => loadBody().runLocationTask(body as never));

/**
 * The task body module. Metro caches a module that threw while loading, so every later fix would fail the same way
 * with only a console line and uploads would stop for the rest of the process: say so once per process in telemetry
 * (its own load can fail too, and that is ignored), and rethrow every time.
 */
// Metro hands the cached load error to every later fix: one report per process is enough.
let reported = false;

function loadBody(): typeof import('./location-task') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the lazy load is the point (see above)
    return require('./location-task');
  } catch (e) {
    if (reported) throw e;
    reported = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy for the same reason
      (require('@/lib/telemetry') as typeof import('@/lib/telemetry')).reportError(e, { kind: 'background_task', extra: { op: 'load' } });
    } catch {
      // Nothing more can be done from here.
    }
    throw e;
  }
}
