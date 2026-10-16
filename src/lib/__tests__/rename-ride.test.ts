import { canSaveRename, checkRideName, renameMenuVisible, rideNameLength, showNameCount } from '../rename-ride';

describe('rename ride validation', () => {
  it('trims and counts characters', () => {
    expect(rideNameLength('  Sunday run  ')).toBe(10);
    expect(rideNameLength('🏍️')).toBe(2); // code points, as char_length counts them
  });

  it('accepts 1 to 60 characters, rejects empty and longer', () => {
    expect(checkRideName('Sunday run')).toBe('ok');
    expect(checkRideName('a'.repeat(60))).toBe('ok');
    expect(checkRideName(`  ${'a'.repeat(60)}  `)).toBe('ok'); // the spaces do not count
    expect(checkRideName('a'.repeat(61))).toBe('too_long');
    expect(checkRideName('')).toBe('empty');
    expect(checkRideName('    ')).toBe('empty');
    expect(checkRideName("' - ")).toBe('empty'); // no letter or digit
  });

  it('shows the count near the limit only', () => {
    expect(showNameCount('a'.repeat(47))).toBe(false);
    expect(showNameCount('a'.repeat(48))).toBe(true);
    expect(showNameCount('a'.repeat(70))).toBe(true);
  });
});

describe('rename Save enablement', () => {
  const base = { draft: 'New name', current: 'Old name', locked: false, saving: false };
  it('is on for a changed valid name', () => expect(canSaveRename(base)).toBe(true));
  it('is off when unchanged (also after trimming)', () => {
    expect(canSaveRename({ ...base, draft: 'Old name' })).toBe(false);
    expect(canSaveRename({ ...base, draft: '  Old name ' })).toBe(false);
  });
  it('is off when empty or too long', () => {
    expect(canSaveRename({ ...base, draft: '  ' })).toBe(false);
    expect(canSaveRename({ ...base, draft: 'a'.repeat(61) })).toBe(false);
  });
  it('is off while moving (typing lock) or saving', () => {
    expect(canSaveRename({ ...base, locked: true })).toBe(false);
    expect(canSaveRename({ ...base, saving: true })).toBe(false);
  });
});

describe('rename menu visibility', () => {
  it('shows for the leader in lobby and live', () => {
    expect(renameMenuVisible({ isLeader: true, status: 'lobby', left: false })).toBe(true);
    expect(renameMenuVisible({ isLeader: true, status: 'active', left: false })).toBe(true);
  });
  it('hides for riders, after the end, once left, or before the ride loads', () => {
    expect(renameMenuVisible({ isLeader: false, status: 'active', left: false })).toBe(false);
    expect(renameMenuVisible({ isLeader: true, status: 'ended', left: false })).toBe(false);
    expect(renameMenuVisible({ isLeader: true, status: 'active', left: true })).toBe(false);
    expect(renameMenuVisible({ isLeader: true, status: undefined, left: false })).toBe(false);
  });
});
