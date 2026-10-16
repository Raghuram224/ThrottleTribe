import { forgetGroupFormed, noteRiderCount, resetGroupTracker } from '../group-formed';
import { markNavRide, pruneNavRides, unmarkNavRide } from '../nav-rides';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  resetGroupTracker();
});

describe('ride.group_formed: the first other rider joins a ride of one (22 D6)', () => {
  it('fires once, on the step from one rider to more', () => {
    expect(noteRiderCount('r1', 1)).toBe(false);
    expect(noteRiderCount('r1', 2)).toBe(true);
    expect(noteRiderCount('r1', 3)).toBe(false);
  });

  it('does not fire for a ride that already had riders when it was first seen (a remount, a restart)', () => {
    expect(noteRiderCount('r1', 3)).toBe(false);
    expect(noteRiderCount('r1', 4)).toBe(false);
  });

  it('is "first": riders leaving and joining again does not fire a second time', () => {
    noteRiderCount('r1', 1);
    expect(noteRiderCount('r1', 2)).toBe(true);
    noteRiderCount('r1', 1);
    expect(noteRiderCount('r1', 2)).toBe(false);
  });

  it('is per ride', () => {
    noteRiderCount('a', 1);
    noteRiderCount('b', 1);
    expect(noteRiderCount('b', 2)).toBe(true);
    expect(noteRiderCount('a', 2)).toBe(true);
  });
});

describe('once per ride across restarts (L6)', () => {
  it('a restart between 1 rider and 2 does not fire a second time', () => {
    noteRiderCount('r1', 1);
    expect(noteRiderCount('r1', 2)).toBe(true);
    // A new process: the per-run counts are gone, the persisted flag is not.
    resetGroupTracker();
    noteRiderCount('r1', 1);
    expect(noteRiderCount('r1', 2)).toBe(false);
  });

  it('the flag goes with the ride marker (unmark, prune)', () => {
    noteRiderCount('r1', 1);
    noteRiderCount('r1', 2);
    markNavRide('r1', '1,2');
    unmarkNavRide('r1');
    expect(mem.get('nav.groupFormed.v1')).toBeUndefined();
    noteRiderCount('r2', 1);
    noteRiderCount('r2', 2);
    pruneNavRides(['r2']);
    expect(mem.get('nav.groupFormed.v1')).toBeUndefined();
  });

  it('forgetGroupFormed drops only that ride', () => {
    for (const id of ['a', 'b']) {
      noteRiderCount(id, 1);
      noteRiderCount(id, 2);
    }
    forgetGroupFormed('a');
    expect(JSON.parse(mem.get('nav.groupFormed.v1') ?? '[]')).toEqual(['b']);
  });
});
