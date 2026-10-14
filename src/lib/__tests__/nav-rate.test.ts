import {
  BASE_TASK_INTERVAL_MS,
  NAV_TASK_INTERVAL_MS,
  needsRestart,
  shouldEnqueue,
  taskIntervalMs,
  throttleUploads,
  UPLOAD_MIN_GAP_MS,
} from '../location/nav-rate';

describe('task interval', () => {
  it('1 s while navigating, 5 s otherwise', () => {
    expect(taskIntervalMs(true)).toBe(1000);
    expect(taskIntervalMs(false)).toBe(5000);
    expect([NAV_TASK_INTERVAL_MS, BASE_TASK_INTERVAL_MS]).toEqual([1000, 5000]);
  });
});

describe('needsRestart (the navActive edge)', () => {
  const a = { tracking: true, registered: false as boolean | null, android: true };
  it('re-registers when the wanted rate differs from the registered one', () => {
    expect(needsRestart({ ...a, wanted: true })).toBe(true); // navActive -> true
    expect(needsRestart({ ...a, registered: true, wanted: false })).toBe(true); // navActive -> false
  });
  it('does nothing when the rate already matches (no restart loop)', () => {
    expect(needsRestart({ ...a, wanted: false })).toBe(false);
    expect(needsRestart({ ...a, registered: true, wanted: true })).toBe(false);
  });
  it('an unknown registered rate (fresh process) is brought to the wanted one', () => {
    expect(needsRestart({ ...a, registered: null, wanted: false })).toBe(true);
  });
  it('only while tracking, and only on Android (iOS ignores timeInterval)', () => {
    expect(needsRestart({ ...a, tracking: false, wanted: true })).toBe(false);
    expect(needsRestart({ ...a, android: false, wanted: true })).toBe(false);
  });
});

describe('upload throttle at the nav rate', () => {
  it('queues every sample when the nav rate is off', () => {
    expect(shouldEnqueue(false, 1000, 1001)).toBe(true);
  });
  it('queues the first sample, then only those at least 4.5 s later', () => {
    expect(shouldEnqueue(true, null, 1000)).toBe(true);
    expect(shouldEnqueue(true, 1000, 1000 + UPLOAD_MIN_GAP_MS - 1)).toBe(false);
    expect(shouldEnqueue(true, 1000, 1000 + UPLOAD_MIN_GAP_MS)).toBe(true);
  });
  it('1 Hz fixes upload about every 5 s', () => {
    let last: number | null = null;
    const queued: number[] = [];
    for (let t = 0; t <= 20_000; t += 1000) {
      if (shouldEnqueue(true, last, t)) {
        last = t;
        queued.push(t);
      }
    }
    expect(queued).toEqual([0, 5000, 10_000, 15_000, 20_000]);
  });
  it('a clock that went backwards does not freeze uploads', () => {
    expect(shouldEnqueue(true, 50_000, 10_000)).toBe(true);
  });
});

describe('throttleUploads (M3)', () => {
  const a = { navRate: true, android: true, sosOn: false };
  it('only at the nav rate, only on Android', () => {
    expect(throttleUploads(a)).toBe(true);
    expect(throttleUploads({ ...a, navRate: false })).toBe(false);
    expect(throttleUploads({ ...a, android: false })).toBe(false);
  });
  it('never while an SOS is on', () => {
    expect(throttleUploads({ ...a, sosOn: true })).toBe(false);
  });
});
