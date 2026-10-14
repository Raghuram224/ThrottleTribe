import { createGroupRide } from '../group-ride';
import { isGroupRide, markGroupRide, parseGroupRides, pruneGroupRides, unmarkGroupRide } from '../group-rides';
import { RideStartBusy } from '../ride-start';
import { STOP_ADDRESS_MAX, STOP_NAME_MAX } from '../solo-nav';

const calls: string[] = [];
const mockCreate = jest.fn();
const mockPropose = jest.fn();
const mockRollback = jest.fn();
const mockLeave = jest.fn();
const mockOpen = jest.fn();
const mockHref = jest.fn();

jest.mock('../ride-api', () => ({
  createRide: (...a: unknown[]) => mockCreate(...a),
  proposeStop: (...a: unknown[]) => mockPropose(...a),
  getMyOpenRide: (...a: unknown[]) => mockOpen(...a),
}));
jest.mock('../stranded-rides', () => ({ rollbackRide: (...a: unknown[]) => mockRollback(...a) }));
jest.mock('../leave-ride', () => ({ leaveIfMember: (...a: unknown[]) => mockLeave(...a) }));
jest.mock('../enter-ride', () => ({ hrefAfterEnter: (...a: unknown[]) => mockHref(...a) }));
jest.mock('expo-sqlite/localStorage/install', () => ({}));

let mem: Map<string, string>;
const place = { name: 'Mysuru Palace', address: 'Sayyaji Rao Rd, Mysuru', lat: 12.3052, lng: 76.6552, category: 'other' as const };
const ride = { id: 'r1', status: 'lobby' };

beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  calls.length = 0;
  jest.clearAllMocks();
  mockCreate.mockImplementation(async () => (calls.push('create'), ride));
  mockPropose.mockImplementation(async () => (calls.push('propose'), { applied: true, eventId: 1 }));
  mockRollback.mockImplementation(async () => void calls.push('end'));
  mockLeave.mockImplementation(async () => void calls.push('leave'));
  mockOpen.mockImplementation(async () => (calls.push('open?'), null));
  mockHref.mockImplementation(async (r: { id: string }) => `/ride/${r.id}/lobby`);
});

describe('createGroupRide (22 §3.6)', () => {
  it('create_ride, then propose_stop with the destination, in that order; the ride stays in the lobby', async () => {
    await expect(createGroupRide({ name: 'Arun\'s ride', thresholdS: 180, dest: place })).resolves.toEqual({ existing: false, ride });
    expect(calls).toEqual(['open?', 'create', 'propose']);
    expect(mockCreate).toHaveBeenCalledWith("Arun's ride", 180, { withDest: true });
    expect(mockPropose).toHaveBeenCalledWith('r1', {
      name: 'Mysuru Palace',
      address: 'Sayyaji Rao Rd, Mysuru',
      lat: 12.3052,
      lng: 76.6552,
      kind: 'destination',
    });
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('a cafe or fuel place is a break, like the solo flow', async () => {
    await createGroupRide({ name: 'x', thresholdS: 180, dest: { ...place, category: 'cafe' } });
    expect(mockPropose.mock.calls[0][1].kind).toBe('break');
  });

  it('cuts the name and address to the RPC limits', async () => {
    await createGroupRide({
      name: 'x',
      thresholdS: 180,
      dest: { ...place, name: 'n'.repeat(200), address: 'a'.repeat(400) },
    });
    const stop = mockPropose.mock.calls[0][1];
    expect(stop.name).toHaveLength(STOP_NAME_MAX);
    expect(stop.address).toHaveLength(STOP_ADDRESS_MAX);
  });

  it('without a destination it only creates (the tile "Start a group ride")', async () => {
    await createGroupRide({ name: 'Sunday ride', thresholdS: 60, dest: null });
    expect(calls).toEqual(['open?', 'create']);
    expect(mockCreate).toHaveBeenCalledWith('Sunday ride', 60, { withDest: false });
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('rolls the ride back when propose_stop fails, and throws the original error', async () => {
    const boom = new Error('stop failed');
    mockPropose.mockImplementation(async () => {
      calls.push('propose');
      throw boom;
    });
    await expect(createGroupRide({ name: 'x', thresholdS: 180, dest: place })).rejects.toBe(boom);
    expect(calls).toEqual(['open?', 'create', 'propose', 'end']);
    expect(mockRollback).toHaveBeenCalledWith('r1');
    expect(isGroupRide('r1')).toBe(false); // the ride is gone: no marker left behind
  });

  it('does not roll back when create_ride itself fails (nothing was made)', async () => {
    const boom = new Error('create failed');
    mockCreate.mockRejectedValue(boom);
    await expect(createGroupRide({ name: 'x', thresholdS: 180, dest: place })).rejects.toBe(boom);
    expect(mockPropose).not.toHaveBeenCalled();
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('leaves the confirmed ride first, and creates nothing if leaving fails', async () => {
    await createGroupRide({ name: 'x', thresholdS: 180, dest: place, leaveRideId: 'old' });
    // Leaving is the confirmed switch: no open-ride check after it (the ride just left is the open one).
    expect(calls).toEqual(['leave', 'create', 'propose']);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockLeave).toHaveBeenCalledWith('old');

    calls.length = 0;
    const boom = new Error('leave failed');
    mockLeave.mockRejectedValue(boom);
    await expect(createGroupRide({ name: 'x', thresholdS: 180, dest: place, leaveRideId: 'old' })).rejects.toBe(boom);
    expect(calls).toEqual([]);
  });

  it('is one start at a time: a second call while one runs is RideStartBusy, and the lock is released afterwards', async () => {
    let release: () => void = () => {};
    mockCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(ride);
        }),
    );
    const first = createGroupRide({ name: 'x', thresholdS: 180, dest: null });
    const second = createGroupRide({ name: 'y', thresholdS: 180, dest: null });
    await expect(second).rejects.toBeInstanceOf(RideStartBusy);
    release();
    await first;
    // Released: a new start works (also after a failure).
    mockCreate.mockRejectedValueOnce(new Error('x'));
    await expect(createGroupRide({ name: 'z', thresholdS: 180, dest: null })).rejects.toThrow('x');
    await expect(createGroupRide({ name: 'z', thresholdS: 180, dest: null })).resolves.toEqual({ existing: false, ride });
  });

  it('remembers the ride as a group ride (22 decision 1: no turn-by-turn for it)', async () => {
    expect(isGroupRide('r1')).toBe(false);
    await createGroupRide({ name: 'x', thresholdS: 180, dest: place });
    expect(isGroupRide('r1')).toBe(true);
    expect(isGroupRide('other')).toBe(false);
    expect(isGroupRide(undefined)).toBe(false);
  });
});

describe('createGroupRide with a ride already open (M1)', () => {
  const open = { ride: { id: 'open1', status: 'lobby' }, member: { role: 'rider' } };

  it('creates nothing and opens the ride that is already open (same as the solo path)', async () => {
    mockOpen.mockImplementation(async () => (calls.push('open?'), open));
    await expect(createGroupRide({ name: 'x', thresholdS: 180, dest: place })).resolves.toEqual({
      existing: true,
      rideId: 'open1',
      href: '/ride/open1/lobby',
    });
    expect(mockHref).toHaveBeenCalledWith(open.ride);
    expect(calls).toEqual(['open?']);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(isGroupRide('open1')).toBe(false);
  });

  it('releases the start lock afterwards', async () => {
    mockOpen.mockImplementationOnce(async () => open);
    await createGroupRide({ name: 'x', thresholdS: 180, dest: null });
    await expect(createGroupRide({ name: 'x', thresholdS: 180, dest: null })).resolves.toMatchObject({ existing: false });
  });

  it('a failing open-ride check is the error to show (nothing is created)', async () => {
    const boom = new Error('offline');
    mockOpen.mockRejectedValueOnce(boom);
    await expect(createGroupRide({ name: 'x', thresholdS: 180, dest: null })).rejects.toBe(boom);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('group ride marker storage', () => {
  it('ignores junk', () => {
    expect(parseGroupRides(null)).toEqual([]);
    expect(parseGroupRides('not json')).toEqual([]);
    expect(parseGroupRides('{"a":1}')).toEqual([]);
    expect(parseGroupRides('["a",3,"",null,"b"]')).toEqual(['a', 'b']);
  });

  it('is not cut by count: a rider with many group rides keeps every marker (L1)', () => {
    const many = Array.from({ length: 30 }, (_, i) => `r${i}`);
    for (const id of many) markGroupRide(id);
    expect(parseGroupRides(mem.get('nav.groupRides.v1'))).toHaveLength(30);
    expect(isGroupRide('r0')).toBe(true);
  });

  it('is pruned when the ride ends: unmark removes just that ride', () => {
    markGroupRide('a');
    markGroupRide('b');
    unmarkGroupRide('a');
    expect(isGroupRide('a')).toBe(false);
    expect(isGroupRide('b')).toBe(true);
    unmarkGroupRide('never-marked');
    expect(isGroupRide('b')).toBe(true);
  });

  it('Home prunes the markers of rides it sees in the ended list', () => {
    for (const id of ['a', 'b', 'c']) markGroupRide(id);
    pruneGroupRides(['b', 'zzz']);
    expect(parseGroupRides(mem.get('nav.groupRides.v1'))).toEqual(['a', 'c']);
    pruneGroupRides(['a', 'c']);
    expect(isGroupRide('a')).toBe(false);
  });

  it('only a runaway list is cut (safety cap, oldest first)', () => {
    const huge = JSON.stringify(Array.from({ length: 500 }, (_, i) => `r${i}`));
    const kept = parseGroupRides(huge);
    expect(kept.length).toBeLessThan(500);
    expect(kept[kept.length - 1]).toBe('r499');
  });
});
