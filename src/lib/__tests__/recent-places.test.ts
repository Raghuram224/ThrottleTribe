import { addRecent, MAX_RECENTS, parseRecents, SAME_PLACE_M, SHOWN_RECENTS, shownRecents, type RecentPlace } from '../recent-places';

// 0.0009 deg of latitude is about 100 m.
const place = (id: string, lat = 12, lng = 77, extra: Partial<RecentPlace> = {}): Omit<RecentPlace, 'usedAt'> => ({
  id,
  name: `Place ${id}`,
  address: 'Somewhere',
  lat,
  lng,
  category: 'other',
  ...extra,
});
const spread = (n: number) => place(`p${n}`, 12 + n * 0.1, 77);

describe('addRecent', () => {
  it('puts the new place first, stamped with the time', () => {
    const list = addRecent(addRecent([], place('a'), 1), place('b', 13), 2);
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
    expect(list[0].usedAt).toBe(2);
  });

  it('drops an older entry with the same id and moves it to the front', () => {
    let list = addRecent([], place('a', 12), 1);
    list = addRecent(list, place('b', 13), 2);
    list = addRecent(list, place('a', 12.5), 3);
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
    expect(list[0].lat).toBe(12.5);
  });

  it('drops an entry within 50 m under another id, keeps one further away', () => {
    let list = addRecent([], place('a', 12), 1);
    list = addRecent(list, place('b', 12 + 40 / 111_320), 2); // 40 m away: same place
    expect(list.map((r) => r.id)).toEqual(['b']);
    list = addRecent(list, place('c', 12 + (40 + SAME_PLACE_M + 30) / 111_320), 3); // 80 m from b: different
    expect(list.map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('keeps at most 8, dropping the oldest', () => {
    let list: RecentPlace[] = [];
    for (let i = 0; i < 12; i++) list = addRecent(list, spread(i), i);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0].id).toBe('p11');
    expect(list[MAX_RECENTS - 1].id).toBe('p4');
  });

  it('does not mutate the input', () => {
    const list = addRecent([], place('a'), 1);
    const copy = [...list];
    addRecent(list, place('b', 13), 2);
    expect(list).toEqual(copy);
  });
});

describe('shownRecents', () => {
  it('shows the 5 newest', () => {
    let list: RecentPlace[] = [];
    for (let i = 0; i < 8; i++) list = addRecent(list, spread(i), i);
    expect(shownRecents(list).map((r) => r.id)).toEqual(['p7', 'p6', 'p5', 'p4', 'p3']);
    expect(shownRecents(list)).toHaveLength(SHOWN_RECENTS);
  });
});

describe('parseRecents', () => {
  it('round-trips a stored list', () => {
    const list = addRecent(addRecent([], place('a'), 1), place('b', 13), 2);
    expect(parseRecents(JSON.stringify(list))).toEqual(list);
  });
  it('gives [] for missing or invalid input', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents(undefined)).toEqual([]);
    expect(parseRecents('')).toEqual([]);
    expect(parseRecents('not json')).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
    expect(parseRecents('42')).toEqual([]);
  });
  it('skips malformed entries and keeps the good ones, newest first', () => {
    const good = { id: 'a', name: 'A', address: '', lat: 12, lng: 77, category: 'cafe', usedAt: 5 };
    const raw = JSON.stringify([
      { ...good, id: 'old', usedAt: 1 },
      { ...good, lat: 'x' },
      { ...good, lat: 95 },
      { ...good, category: 'zoo' },
      { ...good, name: '' },
      null,
      good,
    ]);
    expect(parseRecents(raw).map((r) => r.id)).toEqual(['a', 'old']);
  });
  it('caps a hand-edited long list at 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: 'N', address: '', lat: 12, lng: 77, category: 'other', usedAt: i }));
    expect(parseRecents(JSON.stringify(many))).toHaveLength(MAX_RECENTS);
  });
});
