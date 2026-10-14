import { endStrandedRides, readStranded, rollbackRide } from '../stranded-rides';

jest.mock('expo-sqlite/localStorage/install', () => ({}));
const mockEnd = jest.fn();
jest.mock('../ride-api', () => ({
  endRide: (...a: unknown[]) => mockEnd(...a),
  toRideError: (e: unknown) => ({ code: (e as { code?: string }).code ?? 'unknown' }),
}));

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  mockEnd.mockReset();
});

const netErr = () => Object.assign(new Error('offline'), { code: 'network' });

describe('rollbackRide', () => {
  it('ends the ride and remembers nothing when that works', async () => {
    mockEnd.mockResolvedValue({});
    await rollbackRide('r1', 0);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(readStranded()).toEqual([]);
  });

  it('retries once and forgets it when the retry works', async () => {
    mockEnd.mockRejectedValueOnce(netErr()).mockResolvedValueOnce({});
    await rollbackRide('r1', 0);
    expect(mockEnd).toHaveBeenCalledTimes(2);
    expect(readStranded()).toEqual([]);
  });

  it('records the ride id when the retry fails too, once, and never throws', async () => {
    mockEnd.mockRejectedValue(netErr());
    await expect(rollbackRide('r1', 0)).resolves.toBeUndefined();
    await rollbackRide('r1', 0);
    expect(mockEnd).toHaveBeenCalledTimes(4);
    expect(readStranded()).toEqual(['r1']);
  });
});

describe('endStrandedRides', () => {
  it('does nothing without stranded rides', async () => {
    await endStrandedRides();
    expect(mockEnd).not.toHaveBeenCalled();
  });

  it('ends them, keeps only those that failed for lack of network', async () => {
    mem.set('nav.strandedRides.v1', JSON.stringify(['a', 'b', 'c']));
    mockEnd.mockImplementation(async (id: string) => {
      if (id === 'b') throw netErr();
      if (id === 'c') throw Object.assign(new Error('x'), { code: 'not_leader_or_already_ended' });
    });
    await endStrandedRides();
    expect(mockEnd.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(readStranded()).toEqual(['b']);
  });

  it('clears the list when everything is done', async () => {
    mem.set('nav.strandedRides.v1', JSON.stringify(['a']));
    mockEnd.mockResolvedValue({});
    await endStrandedRides();
    expect(mem.has('nav.strandedRides.v1')).toBe(false);
  });

  it('ignores a corrupt list', () => {
    mem.set('nav.strandedRides.v1', '{nope');
    expect(readStranded()).toEqual([]);
    mem.set('nav.strandedRides.v1', JSON.stringify([1, 'ok', '']));
    expect(readStranded()).toEqual(['ok']);
  });
});
