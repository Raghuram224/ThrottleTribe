import { defaultRideName, displayRideName, isValidRideName, splitNameTag } from '../names';

describe('ride name', () => {
  it('uses a neutral default when the rider name is unknown, never "\'s ride"', () => {
    expect(defaultRideName('')).toBe('Group ride');
    expect(defaultRideName('  ')).toBe('Group ride');
    expect(defaultRideName('Arun')).toBe("Arun's ride");
  });

  it('needs a letter or digit and at most 60 characters', () => {
    expect(isValidRideName('Sunday run')).toBe(true);
    expect(isValidRideName('Ride 2')).toBe(true);
    expect(isValidRideName('சவாரி')).toBe(true);
    expect(isValidRideName('')).toBe(false);
    expect(isValidRideName('   ')).toBe(false);
    expect(isValidRideName("' - ")).toBe(false);
    expect(isValidRideName('a'.repeat(61))).toBe(false);
  });

  it('renders "Group ride" for stored names that are blank or punctuation only', () => {
    expect(displayRideName("'s ride")).toBe("'s ride"); // has letters: a legitimate (if odd) name
    expect(displayRideName("' - ")).toBe('Group ride');
    expect(displayRideName('')).toBe('Group ride');
    expect(displayRideName(null)).toBe('Group ride');
    expect(displayRideName('  Sunday run ')).toBe('Sunday run');
  });

  it('splits a trailing bracketed tag off a display name', () => {
    expect(splitNameTag('Arun (bot)')).toEqual({ base: 'Arun', tag: 'bot' });
    expect(splitNameTag('Priya Nair [test]')).toEqual({ base: 'Priya Nair', tag: 'test' });
    expect(splitNameTag('Arun')).toEqual({ base: 'Arun', tag: null });
    expect(splitNameTag('(bot)')).toEqual({ base: '(bot)', tag: null });
  });
});
