import {
  clearNavRides,
  isNavRideFor,
  markNavRide,
  navRideDest,
  parseNavRides,
  pruneNavRides,
  pruneNavRidesExcept,
  navRideEpoch,
  staleNavRideIds,
  subscribeNavRides,
  unmarkNavRide,
} from '../nav-rides';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const A = '12.3,76.6';
const B = '13.1,77.2';

describe('nav ride marker (22 D5, D6): this phone navigates this ride to this destination', () => {
  it('ignores junk, and the first version of the marker (a list of ride ids: it has no destination)', () => {
    expect(parseNavRides(null)).toEqual({});
    expect(parseNavRides('not json')).toEqual({});
    expect(parseNavRides('["a","b"]')).toEqual({});
    expect(parseNavRides('{"a":"1,2","b":3,"c":"","d":null}')).toEqual({ a: '1,2' });
  });

  it('stores the destination with the ride, and answers per ride and destination', () => {
    expect(navRideDest('r1')).toBeNull();
    markNavRide('r1', A);
    expect(navRideDest('r1')).toBe(A);
    expect(isNavRideFor('r1', A)).toBe(true);
    // Another stop in the same ride (a proposal the leader accepted with riders present) is not navigated.
    expect(isNavRideFor('r1', B)).toBe(false);
    expect(isNavRideFor('other', A)).toBe(false);
  });

  it('never matches no stop, no ride or an empty destination', () => {
    markNavRide('r1', A);
    expect(isNavRideFor('r1', '')).toBe(false);
    expect(isNavRideFor(undefined, A)).toBe(false);
    markNavRide('r2', '');
    expect(navRideDest('r2')).toBeNull();
  });

  it('a solo leader who sets a new stop re-marks the ride with it', () => {
    markNavRide('r1', A);
    markNavRide('r1', B);
    expect(isNavRideFor('r1', A)).toBe(false);
    expect(isNavRideFor('r1', B)).toBe(true);
    expect(Object.keys(parseNavRides(mem.get('nav.navRides.v1')))).toEqual(['r1']);
  });

  it('is not cut by count: a rider with many rides keeps every marker', () => {
    for (let i = 0; i < 30; i++) markNavRide(`r${i}`, A);
    expect(Object.keys(parseNavRides(mem.get('nav.navRides.v1')))).toHaveLength(30);
    expect(isNavRideFor('r0', A)).toBe(true);
  });

  it('is dropped when the ride ends or I leave it: unmark removes just that ride, and the key when empty', () => {
    markNavRide('a', A);
    markNavRide('b', B);
    unmarkNavRide('a');
    expect(isNavRideFor('a', A)).toBe(false);
    expect(isNavRideFor('b', B)).toBe(true);
    unmarkNavRide('never-marked');
    expect(isNavRideFor('b', B)).toBe(true);
    unmarkNavRide('b');
    expect(mem.has('nav.navRides.v1')).toBe(false);
  });

  it('Home prunes the markers of rides it sees in the ended list', () => {
    for (const id of ['a', 'b', 'c']) markNavRide(id, A);
    pruneNavRides(['b', 'zzz']);
    expect(Object.keys(parseNavRides(mem.get('nav.navRides.v1')))).toEqual(['a', 'c']);
    pruneNavRides(['a', 'c']);
    expect(navRideDest('a')).toBeNull();
  });

  it('pruning also deletes the withdrawn "group ride" marker of the old rule', () => {
    mem.set('nav.groupRides.v1', '["old"]');
    pruneNavRides([]);
    expect(mem.has('nav.groupRides.v1')).toBe(false);
  });

  it('sign-out clears every marker, and the withdrawn one', () => {
    markNavRide('a', A);
    mem.set('nav.groupRides.v1', '["old"]');
    clearNavRides();
    expect(mem.has('nav.navRides.v1')).toBe(false);
    expect(mem.has('nav.groupRides.v1')).toBe(false);
  });

  it('only a runaway list is cut (safety cap, oldest first)', () => {
    const huge = JSON.stringify(Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`r${i}`, A])));
    const kept = Object.keys(parseNavRides(huge));
    expect(kept.length).toBeLessThan(500);
    expect(kept[kept.length - 1]).toBe('r499');
  });

  it('tells subscribers on every change, so the layout and the live screen read the same answer', () => {
    const seen: (string | null)[] = [];
    const off = subscribeNavRides(() => seen.push(navRideDest('r1')));
    markNavRide('r1', A);
    markNavRide('r1', B);
    unmarkNavRide('r1');
    markNavRide('r1', A);
    clearNavRides();
    off();
    markNavRide('r1', B);
    expect(seen).toEqual([A, B, null, A, null]);
  });
});

describe('L7: markers of rides that are not my open ride', () => {
  it('staleNavRideIds keeps only the open ride', () => {
    expect(staleNavRideIds(['a', 'b'], { id: 'b' })).toEqual(['a']);
    expect(staleNavRideIds(['a', 'b'], null)).toEqual(['a', 'b']);
  });

  it('pruneNavRidesExcept drops the cancelled-from-lobby marker and keeps the open ride', () => {
    markNavRide('cancelled', A);
    markNavRide('open', B);
    pruneNavRidesExcept({ id: 'open' });
    expect(navRideDest('cancelled')).toBeNull();
    expect(navRideDest('open')).toBe(B);
  });

  it('a read that began before a new marker was made does not drop it', () => {
    const epoch = navRideEpoch();
    markNavRide('fresh', A);
    pruneNavRidesExcept(null, epoch);
    expect(navRideDest('fresh')).toBe(A);
    pruneNavRidesExcept(null, navRideEpoch());
    expect(navRideDest('fresh')).toBeNull();
  });

  it('deletes the orphan legacy keys once', () => {
    mem.set('pref.soloFullMapSeen', 'r1');
    mem.set('nav.groupRides.v1', '["x"]');
    pruneNavRides([]);
    expect(mem.has('pref.soloFullMapSeen')).toBe(false);
    expect(mem.has('nav.groupRides.v1')).toBe(false);
  });
});
