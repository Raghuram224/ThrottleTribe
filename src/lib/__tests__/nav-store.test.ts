import { STORAGE_KEYS } from '../storage';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

let mem: Map<string, string>;
function installStorage() {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
}
/** A fresh store module, as after a cold start. */
function loadStore() {
  let mod!: typeof import('../../store/nav-store');
  jest.isolateModules(() => {
    mod = jest.requireActual('../../store/nav-store');
  });
  return mod;
}
beforeEach(() => {
  mem = new Map();
  installStorage();
});

const arrived = { key: '12,77', state: 'arrived' as const };
const route = { coords: [], distanceM: 1, durationS: 1 };

describe('nav store arrival latch', () => {
  it('survives leaving the ride screens and a cold start, for the same ride only', () => {
    const { useNavStore, arrivalForRide } = loadStore();
    useNavStore.getState().setArrival('r1', arrived);
    // Layout unmount (Back to Home): the session goes, the latch does not.
    useNavStore.getState().resetSession('r1');
    expect(arrivalForRide(useNavStore.getState(), 'r1')).toEqual(arrived);
    expect(arrivalForRide(useNavStore.getState(), 'other')).toEqual({ key: '', state: 'navigating' });
    expect(JSON.parse(mem.get(STORAGE_KEYS.navArrival) ?? 'null')).toEqual({ rideId: 'r1', key: '12,77' });

    const cold = loadStore();
    expect(cold.arrivalForRide(cold.useNavStore.getState(), 'r1')).toEqual(arrived);
    expect(cold.arrivalForRide(cold.useNavStore.getState(), 'r2').state).toBe('navigating');
  });

  it('is cleared when the ride ends, but not by another ride ending', () => {
    const { useNavStore, arrivalForRide } = loadStore();
    useNavStore.getState().setArrival('r1', arrived);
    useNavStore.getState().clearArrival('r2');
    expect(arrivalForRide(useNavStore.getState(), 'r1').state).toBe('arrived');
    useNavStore.getState().clearArrival('r1');
    expect(arrivalForRide(useNavStore.getState(), 'r1').state).toBe('navigating');
    expect(mem.has(STORAGE_KEYS.navArrival)).toBe(false);
  });

  it('is cleared when the destination changes (latch goes back to navigating)', () => {
    const { useNavStore } = loadStore();
    useNavStore.getState().setArrival('r1', arrived);
    useNavStore.getState().setArrival('r1', { key: '13,77', state: 'navigating' });
    expect(mem.has(STORAGE_KEYS.navArrival)).toBe(false);
  });

  it('a new navigation ride starts without a latch', () => {
    const { useNavStore } = loadStore();
    useNavStore.getState().setArrival('r1', arrived);
    useNavStore.getState().startSession('r2', null, true);
    expect(useNavStore.getState().arrival.state).toBe('navigating');
    expect(mem.has(STORAGE_KEYS.navArrival)).toBe(false);
  });
});

describe('nav store session', () => {
  it('is cleared only by the ride that owns it', () => {
    const { useNavStore } = loadStore();
    useNavStore.getState().startSession('r2', { key: 'k', route }, true);
    useNavStore.getState().resetSession('r1');
    expect(useNavStore.getState().seeded).not.toBeNull();
    expect(useNavStore.getState().avoidMotorways).toBe(true);
    useNavStore.getState().resetSession('r2');
    expect(useNavStore.getState().seeded).toBeNull();
    expect(useNavStore.getState().avoidMotorways).toBeNull();
  });
});

describe('start point age', () => {
  it('ignores an origin older than 2 minutes', () => {
    const { freshOrigin, ORIGIN_MAX_AGE_MS } = loadStore();
    const o = { lat: 1, lng: 2 };
    expect(freshOrigin({ origin: o, originAt: 1000 }, 1000 + ORIGIN_MAX_AGE_MS)).toBe(o);
    expect(freshOrigin({ origin: o, originAt: 1000 }, 1001 + ORIGIN_MAX_AGE_MS)).toBeNull();
    expect(freshOrigin({ origin: null, originAt: 0 }, 5)).toBeNull();
  });
});

describe('L3: one arrival announcement per ride and destination', () => {
  it('claims once, whichever source asks first; a new destination or ride claims again', () => {
    const { useNavStore } = loadStore();
    const s = () => useNavStore.getState();
    expect(s().claimArrivalAnnouncement('r1', 'k1')).toBe(true);
    expect(s().claimArrivalAnnouncement('r1', 'k1')).toBe(false);
    expect(s().claimArrivalAnnouncement('r1', 'k2')).toBe(true);
    expect(s().claimArrivalAnnouncement('r2', 'k2')).toBe(true);
  });
});

describe('nav store voice preference', () => {
  it('defaults to on, persists the choice and survives a cold start', () => {
    const a = loadStore();
    expect(a.useNavStore.getState().voiceOn).toBe(true);
    a.useNavStore.getState().setVoiceOn(false);
    expect(mem.get(STORAGE_KEYS.navVoice)).toBe('0');
    expect(loadStore().useNavStore.getState().voiceOn).toBe(false);
    a.useNavStore.getState().setVoiceOn(true);
    expect(mem.get(STORAGE_KEYS.navVoice)).toBe('1');
    expect(loadStore().useNavStore.getState().voiceOn).toBe(true);
  });
  it('a missing or odd stored value is on', () => {
    mem.set(STORAGE_KEYS.navVoice, 'banana');
    expect(loadStore().useNavStore.getState().voiceOn).toBe(true);
  });
});
