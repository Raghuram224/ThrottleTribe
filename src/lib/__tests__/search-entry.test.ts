import { isChipKey, parseSearchEntry } from '../search-entry';

describe('parseSearchEntry (the old /where-to params, as an inline search entry)', () => {
  it('focus=1 opens the input with the keyboard', () => {
    expect(parseSearchEntry({ focus: '1' })).toEqual({ q: '', chip: null, wantsFocus: true });
  });
  it('a chip shows its results and takes no keyboard', () => {
    expect(parseSearchEntry({ chip: 'fuel' })).toEqual({ q: '', chip: 'fuel', wantsFocus: false });
  });
  it('a chip wins over text and focus', () => {
    expect(parseSearchEntry({ chip: 'coffee', q: 'palace', focus: '1' })).toEqual({ q: '', chip: 'coffee', wantsFocus: false });
  });
  it('text is searched again and wants the keyboard', () => {
    expect(parseSearchEntry({ q: 'Mysuru Palace' })).toEqual({ q: 'Mysuru Palace', chip: null, wantsFocus: true });
  });
  it('an unknown chip is ignored; no params is a plain open without focus (a bare deep link does not pop the keyboard)', () => {
    expect(parseSearchEntry({ chip: 'nope' })).toEqual({ q: '', chip: null, wantsFocus: false });
    expect(parseSearchEntry({})).toEqual({ q: '', chip: null, wantsFocus: false });
  });
  it('array params (repeated keys) read their first value', () => {
    expect(parseSearchEntry({ q: ['a', 'b'] })).toMatchObject({ q: 'a' });
  });
  it('isChipKey knows the five chips (coffee, fuel, food, parking, toilets)', () => {
    for (const k of ['coffee', 'fuel', 'food', 'parking', 'toilets']) expect(isChipKey(k)).toBe(true);
    expect(isChipKey('bar')).toBe(false);
  });
});
