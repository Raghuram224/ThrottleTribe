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
    searchStage: 'typing',
    searchContext: 'home',
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

  it('back() walks route -> place -> search results -> browse and reports false when there is nothing to undo', () => {
    const st = usePlanStore.getState();
    st.openSearch({ q: 'palace' });
    st.openPlace(palace, 'palace');
    st.openRoute(palace, 'search');
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'place' });
    expect(usePlanStore.getState().place?.id).toBe('p1');
    // The search it came from, as results, with its query kept.
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'search', place: null, searchStage: 'results', query: 'palace' });
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'browse', place: null, query: '' });
    expect(usePlanStore.getState().back()).toBe(false);
  });

  it('openSearch: the bar types, a chip shows its results at once, "search again" seeds the text; every open is a new seed', () => {
    const st = usePlanStore.getState();
    st.setSheetSnap('expanded');
    st.openSearch();
    let s = usePlanStore.getState();
    expect(s).toMatchObject({ mode: 'search', searchStage: 'typing', sheetSnap: 'peek', place: null });
    expect(s.searchSeed).toMatchObject({ q: '', chip: null, wantsFocus: true });
    const first = s.searchSeed.nonce;
    st.openSearch({ chip: 'fuel' });
    s = usePlanStore.getState();
    expect(s).toMatchObject({ mode: 'search', searchStage: 'results' });
    expect(s.searchSeed).toMatchObject({ q: '', chip: 'fuel', wantsFocus: false });
    expect(s.searchSeed.nonce).toBe(first + 1);
    st.openSearch({ q: 'Mysuru Palace', wantsFocus: true });
    s = usePlanStore.getState();
    expect(s).toMatchObject({ mode: 'search', searchStage: 'typing', query: 'Mysuru Palace' });
    expect(s.searchSeed).toMatchObject({ q: 'Mysuru Palace', chip: null, wantsFocus: true });
  });

  it('search -> browse on back drops the query and the stage; the sheet is the strip again', () => {
    usePlanStore.getState().openSearch({ chip: 'coffee' });
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'browse', query: '', searchStage: 'typing', sheetSnap: 'peek' });
  });

  it('a recent place from the search list goes to the route and Back leaves for browse (a recent has no place sheet)', () => {
    usePlanStore.getState().openSearch();
    usePlanStore.getState().openRoute(palace, 'recent');
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'browse', place: null });
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

  it('the stop search of the live ride is a search context of its own, and every way back to browse clears it (28 §8)', () => {
    const st = usePlanStore.getState();
    st.openSearch({ wantsFocus: true }, 'ride-stop');
    expect(usePlanStore.getState()).toMatchObject({ mode: 'search', searchContext: 'ride-stop' });
    expect(usePlanStore.getState().back()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ mode: 'browse', searchContext: 'home' });
    usePlanStore.getState().openSearch({ chip: 'fuel' }, 'ride-stop');
    usePlanStore.getState().reset();
    expect(usePlanStore.getState().searchContext).toBe('home');
  });

  it('Home\'s own search opens in the home context', () => {
    usePlanStore.getState().openSearch({ q: 'palace' });
    expect(usePlanStore.getState().searchContext).toBe('home');
  });
});
