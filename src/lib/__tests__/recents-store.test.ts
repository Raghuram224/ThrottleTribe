import { STORAGE_KEYS } from '../storage';
import { useRecentsStore } from '../../store/recents-store';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  useRecentsStore.setState({ recents: [] });
});

const place = (id: string, lat: number) => ({ id, name: `P${id}`, address: '', lat, lng: 77, category: 'other' as const });

describe('recents store', () => {
  it('adds newest first, persists, and dedupes by id', () => {
    useRecentsStore.getState().add(place('a', 12));
    useRecentsStore.getState().add(place('b', 13));
    useRecentsStore.getState().add(place('a', 12));
    expect(useRecentsStore.getState().recents.map((r) => r.id)).toEqual(['a', 'b']);
    const stored = JSON.parse(mem.get(STORAGE_KEYS.recentPlaces) ?? '[]') as { id: string }[];
    expect(stored.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('caps the stored list at 8', () => {
    for (let i = 0; i < 12; i++) useRecentsStore.getState().add(place(`p${i}`, 12 + i));
    expect(useRecentsStore.getState().recents).toHaveLength(8);
    expect((JSON.parse(mem.get(STORAGE_KEYS.recentPlaces) ?? '[]') as unknown[]).length).toBe(8);
  });

  it('clear empties the list and removes the stored value (also what sign-out does)', () => {
    useRecentsStore.getState().add(place('a', 12));
    useRecentsStore.getState().clear();
    expect(useRecentsStore.getState().recents).toEqual([]);
    expect(mem.has(STORAGE_KEYS.recentPlaces)).toBe(false);
  });
});
