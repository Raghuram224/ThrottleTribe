// Pure rules for the navigation fix rate (docs/design/21 §4.5.2): no native modules, so they are plain unit tests.

/** The location task's `timeInterval` (Android; iOS ignores it and delivers about 1 Hz either way). */
export const BASE_TASK_INTERVAL_MS = 5000;
export const NAV_TASK_INTERVAL_MS = 1000;
/** While the nav rate is on, a sample is queued for upload only when this long after the previous queued one. */
export const UPLOAD_MIN_GAP_MS = 4500;

export const taskIntervalMs = (nav: boolean): number => (nav ? NAV_TASK_INTERVAL_MS : BASE_TASK_INTERVAL_MS);

/**
 * Whether the registered task must be re-registered for a nav-rate change: only while tracking, only when the rate
 * actually differs from what is registered, and only on Android (on iOS the interval is ignored: nothing to change).
 */
export function needsRestart(a: { tracking: boolean; registered: boolean | null; wanted: boolean; android: boolean }): boolean {
  return a.android && a.tracking && a.registered !== a.wanted;
}

/**
 * Whether uploads are held to the 4.5 s gap. Only on Android, where the task's fix rate actually went from 5 s to
 * 1 s (iOS delivers about 1 Hz either way, so there is nothing to compensate), and never while an SOS is on: an
 * emergency position must not wait.
 */
export function throttleUploads(a: { navRate: boolean; android: boolean; sosOn: boolean }): boolean {
  return a.navRate && a.android && !a.sosOn;
}

/**
 * Uploads stay on today's cadence while the task runs at 1 s: with the nav rate on, a sample is queued only if it
 * is at least 4.5 s after the last queued one. Off: every sample is queued, as before.
 */
export function shouldEnqueue(navRate: boolean, lastQueuedAt: number | null, t: number): boolean {
  if (!navRate || lastQueuedAt === null) return true;
  // A clock that went backwards must not freeze uploads.
  return t < lastQueuedAt || t - lastQueuedAt >= UPLOAD_MIN_GAP_MS;
}
