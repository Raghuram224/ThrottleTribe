import { copy } from '../copy';
import { renameRide, RideError, toRideError } from '../ride-api';

const mockRpc = jest.fn();
const mockTrack = jest.fn();

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('../supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('../telemetry', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));

beforeEach(() => jest.clearAllMocks());

describe('renameRide', () => {
  it('calls the RPC with the trimmed name, returns the row and tracks without the name', async () => {
    const row = { id: 'r1', name: 'Sunday run' };
    mockRpc.mockResolvedValue({ data: row, error: null });
    await expect(renameRide('r1', '  Sunday run ')).resolves.toBe(row);
    expect(mockRpc).toHaveBeenCalledWith('rename_ride', { p_ride_id: 'r1', p_name: 'Sunday run' });
    expect(mockTrack).toHaveBeenCalledWith('ride.renamed');
  });

  it.each([
    ['rename_leader_only', copy['errors.rename_leader_only']],
    ['rename_ride_ended', copy['errors.rename_ride_ended']],
    ['rename_invalid', copy['errors.rename_invalid']],
    ['ride_not_found', copy['errors.ride_not_found']],
  ])('maps %s', async (code, text) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: code } });
    const err = await renameRide('r1', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(RideError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(text);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('maps a missing function (migration 0010 not applied) to a clear error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.rename_ride(p_name, p_ride_id) in the schema cache',
      },
    });
    const err = await renameRide('r1', 'x').catch((e) => e);
    expect(err.code).toBe('rename_unavailable');
  });

  it('maps a network failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    expect((await renameRide('r1', 'x').catch((e) => e)).code).toBe('network');
  });

  it('toRideError keeps unrelated errors unknown', () => {
    expect(toRideError({ message: 'boom' }).code).toBe('unknown');
  });
});
