import { copy } from '../copy';
import { inviteShareMessage } from '../invite';
import { defaultRideName, displayRideName, isValidRideName, splitNameTag } from '../names';

describe('ride name', () => {
  it('uses a neutral default when the rider name is unknown, never "\'s ride"', () => {
    expect(defaultRideName('')).toBe('My ride');
    expect(defaultRideName('  ')).toBe('My ride');
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

describe('every ride started from Home is a normal ride that may be shared (22 D5)', () => {
  it('starts with the default name ("Raghu\'s ride"), never "Solo ride", and the destination stays out of it (decision 3)', () => {
    expect(defaultRideName('Raghu')).toBe("Raghu's ride");
    expect(Object.keys(copy)).not.toContain('solo.rideName');
    expect(Object.keys(copy)).not.toContain('newRide.defaultNameDest');
  });
  it('falls back to a neutral name while the rider\'s name is unknown: a ride of one is not a "Group ride" (D6)', () => {
    expect(defaultRideName('')).toBe('My ride');
  });
  it('the invite text reads sensibly with the default name', () => {
    const msg = inviteShareMessage(defaultRideName('Raghu'), '123456', null);
    expect(msg).toContain("Raghu's ride");
    expect(msg).not.toMatch(/solo/i);
  });
});
