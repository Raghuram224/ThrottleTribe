import { startSoloRide } from '../solo-ride';
import { startNavigationRide, stopKindFor, STOP_ADDRESS_MAX, STOP_NAME_MAX } from '../solo-nav';

const calls: string[] = [];
const mockCreate = jest.fn();
const mockStart = jest.fn();
const mockPropose = jest.fn();
const mockRollback = jest.fn();
const mockOpen = jest.fn();
const mockHref = jest.fn();
const mockLeave = jest.fn();

jest.mock('../ride-api', () => ({
  createRide: (...a: unknown[]) => mockCreate(...a),
  startRide: (...a: unknown[]) => mockStart(...a),
  proposeStop: (...a: unknown[]) => mockPropose(...a),
  getMyOpenRide: (...a: unknown[]) => mockOpen(...a),
}));
// solo-nav imports leave-ride (which pulls in the native location task); the leave itself is faked here.
jest.mock('../leave-ride', () => ({ leaveIfMember: (...a: unknown[]) => mockLeave(...a) }));
jest.mock('../stranded-rides', () => ({ rollbackRide: (...a: unknown[]) => mockRollback(...a) }));
jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('../enter-ride', () => ({ hrefAfterEnter: (...a: unknown[]) => mockHref(...a) }));

const place = { name: 'Mysuru Palace', address: 'Sayyaji Rao Rd, Mysuru', lat: 12.3052, lng: 76.6552, category: 'other' as const };
const ride = { id: 'r1', status: 'lobby' };
const started = { id: 'r1', status: 'active' };

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  mockCreate.mockImplementation(async () => (calls.push('create'), ride));
  mockStart.mockImplementation(async () => (calls.push('start'), started));
  mockPropose.mockImplementation(async () => (calls.push('propose'), { applied: true, eventId: 1 }));
  mockRollback.mockImplementation(async () => void calls.push('end'));
  mockOpen.mockResolvedValue(null);
  mockLeave.mockImplementation(async () => void calls.push('leave'));
  mockHref.mockImplementation(async () => (calls.push('href'), '/ride/r1/live'));
});

describe('stopKindFor', () => {
  it('is a break for cafes, fuel, food, toilets and parking, a destination for anything else', () => {
    for (const c of ['cafe', 'fuel', 'restaurant', 'toilets', 'parking'] as const) expect(stopKindFor(c)).toBe('break');
    expect(stopKindFor('other')).toBe('destination');
  });
});

describe('startNavigationRide', () => {
  it('22 §3.5: leaves the ride I confirmed leaving first, then creates (it is no longer "already open")', async () => {
    await startNavigationRide(place, 180, { leaveRideId: 'old' });
    expect(mockLeave).toHaveBeenCalledWith('old');
    expect(calls.slice(0, 2)).toEqual(['leave', 'create']);
  });

  it('does not leave anything when no leaveRideId is given', async () => {
    await startNavigationRide(place, 180);
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it('creates, starts, sets the stop, then resolves the route, in that order', async () => {
    await expect(startNavigationRide(place, 180)).resolves.toEqual({ rideId: 'r1', href: '/ride/r1/live', existing: false });
    expect(calls).toEqual(['create', 'start', 'propose', 'href']);
    expect(mockCreate).toHaveBeenCalledWith('Solo ride', 180);
    expect(mockStart).toHaveBeenCalledWith('r1');
    expect(mockPropose).toHaveBeenCalledWith('r1', {
      name: 'Mysuru Palace',
      address: 'Sayyaji Rao Rd, Mysuru',
      lat: 12.3052,
      lng: 76.6552,
      kind: 'destination',
    });
    expect(mockHref).toHaveBeenCalledWith(started);
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('uses the break kind for a fuel stop', async () => {
    await startNavigationRide({ ...place, category: 'fuel' }, 60);
    expect(mockPropose.mock.calls[0][1].kind).toBe('break');
  });

  it('clips the name and address to the RPC limits', async () => {
    await startNavigationRide({ ...place, name: 'n'.repeat(200), address: 'a'.repeat(300) }, 180);
    const arg = mockPropose.mock.calls[0][1];
    expect(arg.name).toHaveLength(STOP_NAME_MAX);
    expect(arg.address).toHaveLength(STOP_ADDRESS_MAX);
  });

  it('creates nothing to roll back when create fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('network');
    expect(calls).toEqual([]);
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('ends the ride when start fails, and rethrows the original error', async () => {
    mockStart.mockRejectedValueOnce(new Error('start failed'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('start failed');
    expect(calls).toEqual(['create', 'end']);
    expect(mockRollback).toHaveBeenCalledWith('r1');
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('ends the ride when setting the stop fails', async () => {
    mockPropose.mockRejectedValueOnce(new Error('stop_invalid'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('stop_invalid');
    expect(calls).toEqual(['create', 'start', 'end']);
    expect(mockHref).not.toHaveBeenCalled();
  });

  it('ends the ride when resolving the route fails', async () => {
    mockHref.mockRejectedValueOnce(new Error('boom'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('boom');
    expect(calls).toEqual(['create', 'start', 'propose', 'end']);
  });

  it('shows the original error; the rollback (which retries and records a failed end itself) never replaces it', async () => {
    mockPropose.mockRejectedValueOnce(new Error('original'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('original');
  });

  it('opens the ride I already have instead of creating a second one', async () => {
    mockOpen.mockResolvedValueOnce({ ride: { id: 'open1', status: 'active' }, member: {} });
    mockHref.mockImplementationOnce(async (r: { id: string }) => `/ride/${r.id}/live`);
    await expect(startNavigationRide(place, 180)).resolves.toEqual({ rideId: 'open1', href: '/ride/open1/live', existing: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('creates nothing when the open-ride check fails (offline)', async () => {
    mockOpen.mockRejectedValueOnce(new Error('network'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('network');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shares one start lock with Just ride: a second start while Go runs is refused, and the lock is released after', async () => {
    let release: (v: unknown) => void = () => {};
    mockCreate.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const first = startNavigationRide(place, 180);
    // Same lock from the other entry point (Where to? "Just ride").
    await expect(startSoloRide(180)).rejects.toMatchObject({ name: 'RideStartBusy' });
    await expect(startNavigationRide(place, 180)).rejects.toMatchObject({ name: 'RideStartBusy' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    release(ride);
    await first;
    await expect(startSoloRide(180)).resolves.toBe('/ride/r1/live');
  });

  it('releases the lock when a start fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network'));
    await expect(startNavigationRide(place, 180)).rejects.toThrow('network');
    await expect(startNavigationRide(place, 180)).resolves.toMatchObject({ existing: false });
  });
});
