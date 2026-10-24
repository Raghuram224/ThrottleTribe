import { proposeStop } from '../ride-api';

const mockRpc = jest.fn();

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('../supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('../telemetry', () => ({ track: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: { applied: true, event_id: 7 }, error: null });
});

const stop = { name: 'Shell', address: 'NH 48', lat: 12.9, lng: 77.5, kind: 'break' as const };

describe('proposeStop', () => {
  it('sends the category when the place has one', async () => {
    await expect(proposeStop('r1', { ...stop, category: 'fuel' })).resolves.toEqual({ applied: true, eventId: 7 });
    expect(mockRpc).toHaveBeenCalledWith('propose_stop', {
      p_ride_id: 'r1',
      p_name: 'Shell',
      p_address: 'NH 48',
      p_lat: 12.9,
      p_lng: 77.5,
      p_kind: 'break',
      p_category: 'fuel',
    });
  });

  it('leaves p_category out without one, so the server default (null) applies', async () => {
    await proposeStop('r1', stop);
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_category');
    await proposeStop('r1', { ...stop, category: null });
    expect(mockRpc.mock.calls[1][1]).not.toHaveProperty('p_category');
  });

  it('retries once without the category when the server has no 7-argument function (0012 not applied)', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.propose_stop(...) in the schema cache' } })
      .mockResolvedValueOnce({ data: { applied: false, event_id: 9 }, error: null });
    await expect(proposeStop('r1', { ...stop, category: 'fuel' })).resolves.toEqual({ applied: false, eventId: 9 });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1]).toHaveProperty('p_category', 'fuel');
    expect(mockRpc.mock.calls[1][1]).not.toHaveProperty('p_category');
  });

  it('does not retry other errors, or a call that sent no category', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'stop_leader_only' } });
    await expect(proposeStop('r1', { ...stop, category: 'fuel' })).rejects.toThrow();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    mockRpc.mockClear();
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } });
    await expect(proposeStop('r1', stop)).rejects.toThrow();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
