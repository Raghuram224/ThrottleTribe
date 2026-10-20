import { STORAGE_KEYS } from '../storage';
import { clearHomeDevicePrefs, persistCamera, usePlanStore } from '../../store/plan-store';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  usePlanStore.setState({
    mode: 'browse',
    place: null,
    from: null,
    query: '',
    sheetSnap: 'peek',
    camera: null,
    firstRunSeen: false,
  });
});

const palace = { id: 'p1', name: 'Mysuru Palace', address: 'Sayyaji Rao Rd', lat: 12.3, lng: 76.6, category: 'other' as const, source: 'photon' as const, distanceM: 5000 };

describe('plan store (22 §2.1)', () => {
  it('a searched place opens the place sheet and keeps the query; the distance is not stored', () => {
    usePlanStore.getState().openPlace(palace, 'palace');
    const s = usePlanStore.getState();
    expect(s.mode).toBe('place');
    expect(s.from).toBe('search');
    expect(s.query).toBe('palace');
    expect(s.place).not.toHaveProperty('distanceM');
  });

  it('Directions goes to the route and keeps the query; a recent goes straight to the route with none', () => {
    usePlanStore.getState().openPlace(palace, 'palace');
    usePlanStore.getState().openRoute(palace, 'search');
    expect(usePlanStore.getState()).toMatchObject({ mode: 'route', from: 'search', query: 'palace' });
    usePlanStore.getState().reset();
    usePlanStore.getState().openRoute(palace, 'recent');
    expect(usePlanStore.getState()).toMatchObject({ mode: 'route', from: 'recent', query: '' });
  });

  it('back() walks route -> place -> browse and reports false when there is nothing to undo', () => {
    const st = usePlanStore.getState();
    st.openPlace(palace, 'palace');
    st.openRoute(palace, 'search');
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'place' });
    expect(usePlanStore.getState().place?.id).toBe('p1');
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'browse', place: null });
    expect(usePlanStore.getState().back()).toBe(false);
  });

  it('back() from a recent route returns to browse and drops the place', () => {
    usePlanStore.getState().openRoute(palace, 'recent');
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'browse', place: null });
  });

  it('back() collapses an expanded sheet before it gives up', () => {
    usePlanStore.getState().setSheetSnap('expanded');
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState().sheetSnap).toBe('peek');
    expect(usePlanStore.getState().back()).toBe(false);
  });

  it('reset() (a ride was entered) is browse again, keeps the camera and marks the welcome seen', () => {
    usePlanStore.getState().setCamera({ lat: 1, lng: 2, zoom: 9 });
    usePlanStore.getState().openRoute(palace, 'recent');
    usePlanStore.getState().reset();
    expect(usePlanStore.getState()).toMatchObject({
      mode: 'browse',
      place: null,
      camera: { lat: 1, lng: 2, zoom: 9 },
      firstRunSeen: true,
    });
    expect(mem.get(STORAGE_KEYS.homeFirstRunSeen)).toBe('1');
  });

  it('browsing creates nothing: only memory changes until a camera / first-run write', () => {
    usePlanStore.getState().openPlace(palace, 'q');
    usePlanStore.getState().openRoute(palace, 'search');
    usePlanStore.getState().back();
    expect([...mem.keys()]).toEqual([]);
  });

  it('persists the camera rounded, and sign-out clears the camera and the welcome flag', () => {
    usePlanStore.getState().setCamera({ lat: 12.345678, lng: 76.987654, zoom: 14.76 });
    persistCamera();
    expect(JSON.parse(mem.get(STORAGE_KEYS.homeCamera) ?? '{}')).toEqual({ lat: 12.346, lng: 76.988, zoom: 14.8 });
    usePlanStore.getState().markFirstRunSeen();
    expect(mem.get(STORAGE_KEYS.homeFirstRunSeen)).toBe('1');
    clearHomeDevicePrefs();
    expect(mem.has(STORAGE_KEYS.homeCamera)).toBe(false);
    expect(mem.has(STORAGE_KEYS.homeFirstRunSeen)).toBe(false);
    expect(usePlanStore.getState()).toMatchObject({ camera: null, firstRunSeen: false, mode: 'browse' });
  });

  it('D6: sign-out also clears the "this phone navigates this ride" markers (and the withdrawn group-ride marker)', () => {
    mem.set(STORAGE_KEYS.navRides, '{"r1":"12.3,76.6"}');
    mem.set(STORAGE_KEYS.legacyGroupRides, '["old"]');
    clearHomeDevicePrefs();
    expect(mem.has(STORAGE_KEYS.navRides)).toBe(false);
    expect(mem.has(STORAGE_KEYS.legacyGroupRides)).toBe(false);
  });
});
