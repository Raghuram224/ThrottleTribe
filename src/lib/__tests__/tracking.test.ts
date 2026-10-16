// The location task's start / stop / rate changes (docs/design/21 §4.5.2, P3 review C1, H1, L4). The native side is
// simulated with the two behaviours that bit: Android refuses to (re)start a foreground-service task while the app is
// not in front, and stopping a task that is not registered throws "not found".
import { AppState, Platform } from 'react-native';

import { getNavRateFlag, getRideId, getTaskNav, getTrackingFlag } from '../location/ride-config';
import { setNavRate, startRideTracking, startTrackingRecovery, stopRideTracking } from '../location/tracking';

type Opts = { timeInterval?: number; foregroundService?: unknown };

const mockCalls: string[] = [];
let mockRegistered = false;
let mockAppState = 'active';
let mockStartGate: Promise<void> | null = null;
let mockStopGate: Promise<void> | null = null;
let mockStartFails = 0;
let mockNavActive = false;
let mockStore: Map<string, string>;
let mockAppStateHandler: ((s: string) => void) | null = null;
const mockFlush = jest.fn(async () => {
  mockCalls.push('flush');
});
const mockReportError = jest.fn();

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('expo-battery', () => ({ getBatteryLevelAsync: jest.fn(async () => 0.8) }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('@/store/sos-store', () => ({ useSosStore: { getState: () => ({ phase: 'idle' }) } }));
jest.mock('@/lib/nav-session', () => ({
  navSession: { ingest: jest.fn(), stop: jest.fn(), getState: () => ({ active: mockNavActive }) },
}));
jest.mock('@/lib/telemetry', () => ({
  track: jest.fn(),
  reportError: (...a: unknown[]) => mockReportError(...a),
}));
jest.mock('@/lib/location/sample-queue', () => ({
  enqueue: jest.fn(),
  flush: () => mockFlush(),
  recordError: jest.fn(),
}));
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  LocationAccuracy: { High: 4 },
  LocationActivityType: { AutomotiveNavigation: 2 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => mockRegistered),
  startLocationUpdatesAsync: jest.fn(async (_name: string, opts: Opts) => {
    mockCalls.push(`start:${opts.timeInterval}`);
    // LocationModule.kt: a foreground-service task cannot be (re)started while the app is not in front.
    if (mockAppState !== 'active' && opts.foregroundService) throw new Error('ForegroundServiceStartNotAllowed');
    if (mockStartFails > 0) {
      mockStartFails -= 1;
      throw new Error('start failed');
    }
    if (mockStartGate) await mockStartGate;
    mockRegistered = true;
  }),
  stopLocationUpdatesAsync: jest.fn(async () => {
    mockCalls.push('stop');
    if (mockStopGate) await mockStopGate;
    // TaskService.unregisterTask: "Task ... not found" when it is not registered.
    if (!mockRegistered) throw new Error("Task 'throttle-tribe-location' not found for app ID 'x'.");
    mockRegistered = false;
  }),
}));

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
};
const gate = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => {
    open = r;
  });
  return { p, open };
};
const setAppState = (s: string) => {
  mockAppState = s;
  Object.defineProperty(AppState, 'currentState', { value: s, configurable: true, writable: true });
};
const origOS = Platform.OS;

beforeEach(() => {
  mockStore = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mockStore.get(k) ?? null,
    setItem: (k: string, v: string) => void mockStore.set(k, v),
    removeItem: (k: string) => void mockStore.delete(k),
  };
  mockCalls.length = 0;
  mockRegistered = false;
  mockStartGate = null;
  mockStopGate = null;
  mockStartFails = 0;
  mockNavActive = false;
  mockAppStateHandler = null;
  mockFlush.mockClear();
  mockReportError.mockClear();
  setAppState('active');
  Platform.OS = 'android';
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
    mockAppStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
});
// Every recovery started by a test is cancelled with it: a recheck timer firing after teardown threw on a gone AppState.
const cancels: (() => void)[] = [];
const recovery = () => {
  const cancel = startTrackingRecovery();
  cancels.push(cancel);
  return cancel;
};
afterEach(async () => {
  for (const c of cancels.splice(0)) c();
  await stopRideTracking();
  Platform.OS = origOS;
  jest.restoreAllMocks();
});

const startRide = async () => {
  const r = await startRideTracking('ride-1');
  expect(r.ok).toBe(true);
  mockCalls.length = 0;
};

describe('C1: the rate changes only in front, and never by stop -> start', () => {
  it('re-registers in place (no stop) at 1 s when navigation starts in front', async () => {
    await startRide();
    await setNavRate(true);
    expect(mockCalls).toEqual(['start:1000']);
    expect(getTaskNav()).toBe(true);
    await setNavRate(false);
    expect(mockCalls).toEqual(['start:1000', 'start:5000']);
    expect(mockCalls).not.toContain('stop');
  });

  it('with the screen off it does nothing (a start would be refused and cost the registration) and applies on the next active', async () => {
    await startRide();
    setAppState('background');
    await setNavRate(true);
    expect(mockCalls).toEqual([]);
    expect(mockRegistered).toBe(true); // the task keeps running at 5 s
    expect(getNavRateFlag()).toBe(true); // the wish is kept

    mockNavActive = true; // the session is still running
    recovery();
    setAppState('active');
    mockAppStateHandler?.('active');
    await settle();
    expect(mockCalls).toEqual(['start:1000']);
    expect(getTaskNav()).toBe(true);
  });

  it('a failed start leaves the registered rate unchanged, reports it, and is retried on the next active', async () => {
    await startRide();
    mockStartFails = 1;
    await setNavRate(true);
    expect(getTaskNav()).toBe(false);
    expect(mockReportError).toHaveBeenCalled();
    expect(mockRegistered).toBe(true);

    mockNavActive = true;
    recovery();
    mockAppStateHandler?.('active');
    await settle();
    expect(mockCalls.filter((c) => c === 'start:1000')).toHaveLength(2);
    expect(getTaskNav()).toBe(true);
  });

  it('recovery: on active during a ride, a task that is no longer registered is started again', async () => {
    await startRide();
    mockRegistered = false; // the service was lost
    recovery();
    mockAppStateHandler?.('active');
    await settle();
    expect(mockCalls).toEqual(['start:5000']);
    expect(mockRegistered).toBe(true);
  });

  it('recovery does nothing when the ride is not being tracked', async () => {
    recovery();
    mockAppStateHandler?.('active');
    await settle();
    expect(mockCalls).toEqual([]);
  });

  it('while backgrounded the recovery stays idle', async () => {
    await startRide();
    mockRegistered = false;
    setAppState('background');
    recovery();
    mockAppStateHandler?.('background');
    await settle();
    expect(mockCalls).toEqual([]);
  });
});

describe('M2 (D6): Android cold start reports an unknown app state and sends no change event', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('the recovery runs once the state reads active within ~2 s, with no change event', async () => {
    await startRide();
    mockRegistered = false; // the service was lost with the old process
    setAppState('unknown');
    recovery();
    await settle();
    expect(mockCalls).toEqual([]); // not treated as in front: a service start from the background would throw
    setAppState('active'); // the app became active before the listener existed: no event follows
    jest.advanceTimersByTime(2100);
    await settle();
    expect(mockCalls).toEqual(['start:5000']);
    expect(mockRegistered).toBe(true);
  });

  it('never starts the task while the state stays unknown, nor after the app is explicitly behind', async () => {
    await startRide();
    mockRegistered = false;
    setAppState('unknown');
    recovery();
    jest.advanceTimersByTime(5000);
    await settle();
    expect(mockCalls).toEqual([]);
    setAppState('background');
    jest.advanceTimersByTime(5000);
    await settle();
    expect(mockCalls).toEqual([]);
  });

  it('a change event to active does the work at once and the pending checks do not run it again', async () => {
    await startRide();
    mockRegistered = false;
    setAppState('unknown');
    recovery();
    setAppState('active');
    mockAppStateHandler?.('active');
    await settle();
    expect(mockCalls).toEqual(['start:5000']);
    jest.advanceTimersByTime(5000);
    await settle();
    expect(mockCalls).toEqual(['start:5000']);
  });
});

describe('L4: the registered rate survives the JS process', () => {
  it('a task registered at the right rate by an earlier process is not re-registered', async () => {
    await startRide();
    expect(getTaskNav()).toBe(false);
    recovery(); // a "new process": nothing in memory, the persisted rate matches
    await settle();
    expect(mockCalls).toEqual([]);
  });

  it('a navigation rate left over from a dead process (no session) is cleared at app start and the task goes back to 5 s', async () => {
    await startRide();
    await setNavRate(true);
    mockCalls.length = 0;
    mockNavActive = false;
    recovery();
    await settle();
    expect(getNavRateFlag()).toBe(false);
    expect(mockCalls).toEqual(['start:5000']);
  });

  it('a live session keeps its rate', async () => {
    await startRide();
    await setNavRate(true);
    mockCalls.length = 0;
    mockNavActive = true;
    recovery();
    await settle();
    expect(getNavRateFlag()).toBe(true);
    expect(mockCalls).toEqual([]);
  });

  it('an app start with the flag stale never starts anything headless-style while not in front', async () => {
    await startRide();
    setAppState('background');
    mockStore.set('ride.navRate', '1');
    await setNavRate(true);
    expect(mockCalls).toEqual([]);
  });
});

describe('H1: start, stop and rate changes are one queue', () => {
  it('End ride while the rate change is in flight: the task ends up stopped, flags cleared, nothing re-registers', async () => {
    await startRide();
    const g = gate();
    mockStartGate = g.p;
    const rate = setNavRate(true); // re-registers; the native start is slow
    await settle();
    const stopped = stopRideTracking();
    // The flags are cleared before anything is awaited.
    expect(getTrackingFlag()).toBe(false);
    expect(getNavRateFlag()).toBe(false);
    mockStartGate = null;
    g.open();
    await Promise.all([rate, stopped]);
    await settle();
    expect(mockRegistered).toBe(false);
    expect(getRideId()).toBeNull();
    expect(getTaskNav()).toBeNull();
    expect(mockFlush).toHaveBeenCalled();
    expect(mockCalls[mockCalls.length - 1]).toBe('flush');
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('End ride before a queued rate change starts: that change bails and does not bring the task back', async () => {
    await startRide();
    const g = gate();
    mockStopGate = g.p;
    const a = setNavRate(true); // runs: start
    const b = setNavRate(false); // queued behind
    const stopped = stopRideTracking(); // queued behind both, clears the flags now
    const c = setNavRate(true); // asked again after the ride ended (cleanup race in the layout)
    g.open();
    await Promise.all([a, b, stopped, c]);
    await settle();
    expect(mockRegistered).toBe(false);
    expect(getTrackingFlag()).toBe(false);
  });

  it('a stop that finds the task already gone (TaskNotFound) is a success: flush and clear still happen', async () => {
    await startRide();
    mockRegistered = true;
    // Native says "registered" when asked and "not found" when stopped (the other stop won the race).
    (jest.requireMock('expo-location').stopLocationUpdatesAsync as jest.Mock).mockImplementationOnce(async () => {
      mockRegistered = false;
      throw new Error("Task 'throttle-tribe-location' not found for app ID 'x'.");
    });
    await expect(stopRideTracking()).resolves.toBeUndefined();
    expect(mockFlush).toHaveBeenCalled();
    expect(getRideId()).toBeNull();
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('a start queued behind an End ride for an older ride does not clear the newer ride on its way out', async () => {
    await startRide();
    const g = gate();
    mockStopGate = g.p;
    const stopped = stopRideTracking();
    await settle();
    const next = startRideTracking('ride-2'); // permission prompts resolve, then it queues behind the stop
    await settle();
    mockStopGate = null;
    g.open();
    await stopped;
    await expect(next).resolves.toMatchObject({ ok: true });
    expect(getRideId()).toBe('ride-2');
    expect(getTrackingFlag()).toBe(true);
    expect(mockRegistered).toBe(true);
  });

  it('a start superseded by an End ride registers nothing', async () => {
    const g = gate();
    mockStopGate = null;
    (jest.requireMock('expo-location').requestBackgroundPermissionsAsync as jest.Mock).mockImplementationOnce(async () => {
      await g.p;
      return { status: 'granted' };
    });
    const starting = startRideTracking('ride-9');
    await settle();
    const stopped = stopRideTracking();
    g.open();
    const [r] = await Promise.all([starting, stopped]);
    expect(r.ok).toBe(false);
    expect(mockRegistered).toBe(false);
    expect(getRideId()).toBeNull();
    expect(getTrackingFlag()).toBe(false);
  });
});

describe('iOS', () => {
  it('never re-registers for a rate change (the interval is ignored there)', async () => {
    Platform.OS = 'ios';
    await startRide();
    await setNavRate(true);
    expect(mockCalls).toEqual([]);
  });
});
