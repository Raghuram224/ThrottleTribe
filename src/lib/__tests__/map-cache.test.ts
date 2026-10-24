const mockSet = jest.fn();
jest.mock('@maplibre/maplibre-react-native', () => ({
  OfflineManager: { setMaximumAmbientCacheSize: (...a: unknown[]) => mockSet(...a) },
}));

beforeEach(() => jest.clearAllMocks());

// The module keeps a once-per-run flag: each test loads a fresh copy.
function load(): typeof import('../map-cache') {
  let m: typeof import('../map-cache') | null = null;
  jest.isolateModules(() => {
    m = jest.requireActual('../map-cache');
  });
  return m as unknown as typeof import('../map-cache');
}

describe('raiseMapCache', () => {
  it('does nothing at import: only the first map finishing loading asks the native cache', () => {
    load();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('asks the native tile cache for 200 MB, once per run however many maps load', () => {
    mockSet.mockResolvedValue(undefined);
    const { raiseMapCache, AMBIENT_CACHE_BYTES } = load();
    raiseMapCache();
    raiseMapCache();
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(AMBIENT_CACHE_BYTES);
    expect(AMBIENT_CACHE_BYTES).toBe(200 * 1024 * 1024);
  });

  it('swallows a native failure: the default cache just stays', async () => {
    mockSet.mockRejectedValue(new Error('no file source'));
    const { raiseMapCache } = load();
    expect(() => raiseMapCache()).not.toThrow();
    await Promise.resolve();
  });
});
