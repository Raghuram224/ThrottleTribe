// The Terrain / Standard preference (docs/design/25 T2, §11): default, persistence, telemetry.
import * as storage from '@/lib/storage';
import { parseMapLayer, usePrefsStore } from '@/store/prefs-store';

// jest.mock calls are hoisted above the imports; the factories only run when the modules load.
const mockTrack = jest.fn();

jest.mock('@/lib/storage', () => {
  const data: Record<string, string> = {};
  return {
    __data: data,
    STORAGE_KEYS: new Proxy({}, { get: (_t, k: string) => `key.${k}` }),
    readItem: (k: string) => data[k] ?? null,
    writeItem: (k: string, v: string | null) => {
      if (v === null) delete data[k];
      else data[k] = v;
    },
  };
});
jest.mock('@/lib/telemetry', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));

const saved = (storage as unknown as { __data: Record<string, string> }).__data;

describe('mapLayer preference', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    usePrefsStore.setState({ mapLayer: 'standard' });
  });

  it('defaults to Standard and reads unknown stored values as Standard', () => {
    expect(usePrefsStore.getState().mapLayer).toBe('standard');
    expect(parseMapLayer(null)).toBe('standard');
    expect(parseMapLayer('hybrid')).toBe('standard');
    expect(parseMapLayer('terrain')).toBe('terrain');
  });

  it('saves the choice under pref.mapLayer and tells telemetry which layer and from where, never more', () => {
    usePrefsStore.getState().setMapLayer('terrain', 'home');
    expect(usePrefsStore.getState().mapLayer).toBe('terrain');
    expect(saved['key.mapLayer']).toBe('terrain');
    expect(mockTrack).toHaveBeenCalledWith('map.layer_changed', { layer: 'terrain', from: 'home' });
    usePrefsStore.getState().setMapLayer('standard', 'profile');
    expect(saved['key.mapLayer']).toBe('standard');
    expect(mockTrack).toHaveBeenLastCalledWith('map.layer_changed', { layer: 'standard', from: 'profile' });
  });

  it('choosing what is already chosen does nothing (no event)', () => {
    usePrefsStore.getState().setMapLayer('standard', 'home');
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
