import { Platform } from 'react-native';

// The location task feeds the navigation engine and keeps uploads on their cadence (docs/design/21 §4.5.2).
type TaskFn = (arg: { data?: { locations: unknown[] }; error?: { message: string } | null; executionInfo?: unknown }) => Promise<void>;

const mockIngest = jest.fn();
const mockEnqueue = jest.fn();
const mockFlush = jest.fn(async () => {});
let mockTask: TaskFn | null = null;
const mockDefine = jest.fn();
// One shared fake for telemetry's reportError: a mock registered by an earlier test may be reused by a later one.
const mockReport = jest.fn();
let mockStore: Map<string, string>;
let mockSosPhase = 'idle';
const mockTrack = jest.fn();

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('expo-battery', () => ({ getBatteryLevelAsync: jest.fn(async () => 0.8) }));
jest.mock('expo-task-manager', () => ({
  defineTask: (name: string, fn: TaskFn) => {
    mockTask = fn;
    mockDefine(name, fn);
  },
}));
jest.mock('@/lib/nav-session', () => ({ navSession: { ingest: (...a: unknown[]) => mockIngest(...a) } }));
jest.mock('@/lib/location/sample-queue', () => ({
  enqueue: (...a: unknown[]) => mockEnqueue(...a),
  flush: () => mockFlush(),
  recordError: jest.fn(),
}));
jest.mock('@/lib/telemetry', () => ({ reportError: jest.fn(), track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('@/store/sos-store', () => ({ useSosStore: { getState: () => ({ phase: mockSosPhase }) } }));

const origOS = Platform.OS;
const loc = (t: number, over: Record<string, unknown> = {}) => ({
  timestamp: t,
  coords: { latitude: 12.5, longitude: 77.5, accuracy: 6, speed: 14, heading: 90, ...over },
});

// A fresh copy of the task body per test (its latency window is module state).
function load() {
  let run: TaskFn | null = null;
  jest.isolateModules(() => {
    run = jest.requireActual('../location/location-task').runLocationTask;
  });
  return run as unknown as TaskFn;
}

beforeEach(() => {
  Platform.OS = 'android';
  mockSosPhase = 'idle';
  mockTrack.mockClear();
  mockStore = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mockStore.get(k) ?? null,
    setItem: (k: string, v: string) => void mockStore.set(k, v),
    removeItem: (k: string) => void mockStore.delete(k),
  };
  mockStore.set('ride.currentRideId', 'ride-1');
  mockIngest.mockClear();
  mockEnqueue.mockClear();
  mockFlush.mockClear();
});

afterAll(() => {
  Platform.OS = origOS;
});

describe('background task', () => {
  it('forwards every fix to the engine as a NavFix, then queues the upload as before', async () => {
    const task = load();
    await task({ data: { locations: [loc(1000), loc(2000, { speed: -1, heading: -1, accuracy: 20 })] } });
    expect(mockIngest).toHaveBeenCalledTimes(2);
    expect(mockIngest).toHaveBeenNthCalledWith(1, { lat: 12.5, lng: 77.5, accuracyM: 6, speedMps: 14, courseDeg: 90, t: 1000 });
    expect(mockIngest).toHaveBeenNthCalledWith(2, { lat: 12.5, lng: 77.5, accuracyM: 20, speedMps: null, courseDeg: null, t: 2000 });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0]).toHaveLength(2); // nav rate off: everything is queued
    expect(mockFlush).toHaveBeenCalled();
  });

  it('with the nav rate on, every fix reaches the engine but uploads are 4.5 s apart', async () => {
    mockStore.set('ride.navRate', '1');
    const task = load();
    const t0 = 1_000_000;
    for (let i = 0; i < 12; i++) await task({ data: { locations: [loc(t0 + i * 1000)] } });
    expect(mockIngest).toHaveBeenCalledTimes(12);
    const uploaded = mockEnqueue.mock.calls.flatMap((c) => (c[0] as { recorded_at: string }[]).map((r) => Date.parse(r.recorded_at) - t0));
    expect(uploaded).toEqual([0, 5000, 10_000]);
  });

  it('a call whose samples are all throttled does not touch the battery or the network', async () => {
    mockStore.set('ride.navRate', '1');
    const task = load();
    await task({ data: { locations: [loc(1_000_000)] } });
    mockFlush.mockClear();
    mockEnqueue.mockClear();
    await task({ data: { locations: [loc(1_001_000)] } });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
    expect(mockIngest).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a ride (headless relaunch after the ride ended)', async () => {
    mockStore.delete('ride.currentRideId');
    const task = load();
    await task({ data: { locations: [loc(1000)] } });
    expect(mockIngest).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('an engine error never costs the group its position upload', async () => {
    mockIngest.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const task = load();
    await task({ data: { locations: [loc(1000)] } });
    expect(mockIngest).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledTimes(1); // the upload still goes
  });

  it('M3: while my SOS is on every sample is uploaded, even at the nav rate', async () => {
    mockStore.set('ride.navRate', '1');
    mockSosPhase = 'active';
    const task = load();
    const t0 = 1_000_000;
    for (let i = 0; i < 6; i++) await task({ data: { locations: [loc(t0 + i * 1000)] } });
    expect(mockEnqueue).toHaveBeenCalledTimes(6);
  });

  it('M3: a sending or retrying SOS bypasses the throttle too', async () => {
    mockStore.set('ride.navRate', '1');
    mockSosPhase = 'retrying';
    const task = load();
    await task({ data: { locations: [loc(1_000_000)] } });
    await task({ data: { locations: [loc(1_001_000)] } });
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('M3: iOS is not throttled (its fix rate never changed)', async () => {
    Platform.OS = 'ios';
    mockStore.set('ride.navRate', '1');
    const task = load();
    for (let i = 0; i < 5; i++) await task({ data: { locations: [loc(1_000_000 + i * 1000)] } });
    expect(mockEnqueue).toHaveBeenCalledTimes(5);
  });

  it('M3: once the SOS ends the throttle is back', async () => {
    mockStore.set('ride.navRate', '1');
    mockSosPhase = 'active';
    const task = load();
    await task({ data: { locations: [loc(1_000_000)] } });
    mockSosPhase = 'idle';
    mockEnqueue.mockClear();
    await task({ data: { locations: [loc(1_001_000)] } });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('M5: reports fix-to-engine latency once a minute while navigating (counts and ms only)', async () => {
    mockStore.set('ride.navRate', '1');
    const task = load();
    const realNow = Date.now;
    let now = 5_000_000;
    Date.now = () => now;
    try {
      await task({ data: { locations: [loc(now - 400), loc(now - 200)] }, executionInfo: { appState: 'background' } });
      expect(mockTrack).not.toHaveBeenCalled();
      now += 61_000;
      await task({ data: { locations: [loc(now - 3000)] }, executionInfo: { appState: 'background' } });
    } finally {
      Date.now = realNow;
    }
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('nav.fix_latency', { n: 3, avg_ms: 1200, max_ms: 3000, max_batch: 2, app_state: 'background' });
  });

  it('M5: no latency event while not navigating', async () => {
    const task = load();
    await task({ data: { locations: [loc(Date.now() - 5000)] } });
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

describe('boot-time definition', () => {
  it('registers the task without loading the heavy modules, and runs the body on the first fix', async () => {
    mockTask = null;
    mockDefine.mockClear();
    mockIngest.mockClear();
    mockStore.set('ride.currentRideId', 'ride-1');
    jest.isolateModules(() => {
      // Evaluating the body module at registration would touch expo-battery and the rest at bundle load.
      jest.doMock('../location/location-task', () => {
        throw new Error('loaded at bundle load');
      });
      expect(() => jest.requireActual('../location/background-task')).not.toThrow();
    });
    expect(mockDefine).toHaveBeenCalledWith('throttle-tribe-location', expect.any(Function));
    jest.dontMock('../location/location-task');
    // Isolated, so the lazy require inside the callback lands in the same registry as the registration.
    let first: Promise<void> | null = null;
    jest.isolateModules(() => {
      jest.requireActual('../location/background-task');
      first = (mockTask as unknown as TaskFn)({ data: { locations: [loc(1000)] } });
    });
    await first;
    expect(mockIngest).toHaveBeenCalledTimes(1);
  });
});

describe('a body that fails to load', () => {
  it('reports it once to telemetry (op: load) and rethrows, so the failure is not silent', async () => {
    mockReport.mockClear();
    mockTask = null;
    let first: Promise<void> | null = null;
    jest.isolateModules(() => {
      jest.doMock('../location/location-task', () => {
        throw new Error('native module missing');
      });
      jest.doMock('@/lib/telemetry', () => ({ reportError: (...a: unknown[]) => mockReport(...a), track: jest.fn() }));
      jest.requireActual('../location/background-task');
      first = Promise.resolve().then(() => (mockTask as unknown as TaskFn)({ data: { locations: [] } }));
    });
    await expect(first).rejects.toThrow('native module missing');
    expect(mockReport).toHaveBeenCalledWith(expect.any(Error), { kind: 'background_task', extra: { op: 'load' } });
    jest.dontMock('../location/location-task');
  });

  it('still rethrows when telemetry cannot load either', async () => {
    mockTask = null;
    let first: Promise<void> | null = null;
    jest.isolateModules(() => {
      jest.doMock('../location/location-task', () => {
        throw new Error('native module missing');
      });
      jest.doMock('@/lib/telemetry', () => {
        throw new Error('telemetry down');
      });
      jest.requireActual('../location/background-task');
      first = Promise.resolve().then(() => (mockTask as unknown as TaskFn)({ data: { locations: [] } }));
    });
    await expect(first).rejects.toThrow('native module missing');
    jest.dontMock('../location/location-task');
    jest.dontMock('@/lib/telemetry');
  });

  it('reports once per process however many fixes hit the cached failure, and rethrows every time', async () => {
    mockReport.mockClear();
    mockTask = null;
    const errors: unknown[] = [];
    jest.isolateModules(() => {
      jest.doMock('../location/location-task', () => {
        throw new Error('native module missing');
      });
      jest.doMock('@/lib/telemetry', () => ({ reportError: (...a: unknown[]) => mockReport(...a), track: jest.fn() }));
      jest.requireActual('../location/background-task');
      // Called inside the isolated registry, where the lazy requires resolve to these mocks.
      for (let i = 0; i < 3; i++) {
        try {
          void (mockTask as unknown as TaskFn)({ data: { locations: [] } });
        } catch (e) {
          errors.push(e);
        }
      }
    });
    expect(errors).toHaveLength(3);
    for (const e of errors) expect((e as Error).message).toBe('native module missing');
    expect(mockReport).toHaveBeenCalledTimes(1);
    jest.dontMock('../location/location-task');
    jest.dontMock('@/lib/telemetry');
  });
});
